/**
 * Browser port of the casepipe matcher (pipeline/casepipe/match.py).
 *
 * Mirrors the Python semantics exactly:
 *  - token normalization: lowercase, strip all but [\w./-]
 *  - variants matched longest-first with claimed-index de-overlap
 *  - exact window match = quality 1.0; fuzzy fallback per token only for
 *    variant tokens of length >= 5, every token must clear the InDel
 *    ratio bar (rapidfuzz fuzz.ratio equivalent), mean quality capped
 *    at x0.97 below exact
 *  - negation cues scanned in a preceding word window
 *  - confidence = match_quality * mean word conf * source factor
 *    (text_layer 1.0, ocr 0.94)
 *  - routing: negated -> negated; >=0.85 auto; >=0.6 review; else escalated
 */

import taxonomy from "@/pipeline/casepipe/terms.json";

export interface PipeWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  conf: number; // 0..1 (native text layer = 0.99)
}

export type PipeRouting = "auto" | "review" | "escalated" | "negated";

export interface PipeFinding {
  idx: number;
  category: string;
  category_label: string;
  term_key: string;
  term_label: string;
  variant: string;
  page: number;
  match_quality: number;
  ocr_conf: number;
  source: "text_layer" | "ocr";
  negated: boolean;
  evidence: string;
  rects: number[][]; // matched word bboxes in the caller's coordinate space
  confidence: number;
  routing: PipeRouting;
}

interface FlatVariant {
  catKey: string;
  catLabel: string;
  termKey: string;
  termLabel: string;
  variant: string;
  toks: string[];
}

const THRESHOLDS = taxonomy.thresholds as {
  auto_accept: number;
  review: number;
  fuzzy_min_ratio: number;
};
const NEG_CUES: string[] = taxonomy.negation_cues as string[];
const NEG_WINDOW: number = taxonomy.negation_window_words as number;

function norm(token: string): string {
  return token.toLowerCase().replace(/[^\w./-]+/g, "");
}

/** rapidfuzz fuzz.ratio equivalent: normalized InDel similarity 0..100.
 *  indel_distance = len(a)+len(b) - 2*LCS(a,b)  =>  ratio = 200*LCS/(la+lb) */
function indelRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 100;
  if (la === 0 || lb === 0) return 0;
  let prev = new Array<number>(lb + 1).fill(0);
  let curr = new Array<number>(lb + 1).fill(0);
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  const lcs = prev[lb];
  return (200 * lcs) / (la + lb);
}

function matchVariantAt(
  normWords: string[],
  i: number,
  variantToks: string[],
  fuzzyMin: number
): number {
  const n = variantToks.length;
  if (i + n > normWords.length) return 0;
  const window = normWords.slice(i, i + n);
  if (window.every((w, k) => w === variantToks[k])) return 1.0;
  const qualities: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = window[k];
    const b = variantToks[k];
    if (a === b) {
      qualities.push(1.0);
      continue;
    }
    if (b.length < 5) return 0;
    const r = indelRatio(a, b);
    if (r < fuzzyMin) return 0;
    qualities.push(r / 100);
  }
  const mean = qualities.reduce((s, q) => s + q, 0) / qualities.length;
  return Math.round(mean * 0.97 * 10000) / 10000;
}

function isNegated(words: PipeWord[], start: number): boolean {
  const lo = Math.max(0, start - NEG_WINDOW);
  const preceding = words.slice(lo, start).map((w) => norm(w.text));
  for (const cue of NEG_CUES) {
    const cueToks = cue.split(" ");
    for (let i = 0; i <= preceding.length - cueToks.length; i++) {
      if (cueToks.every((t, k) => preceding[i + k] === t)) return true;
    }
  }
  return false;
}

function windowText(words: PipeWord[], start: number, end: number, pad = 8): string {
  const lo = Math.max(0, start - pad);
  const hi = Math.min(words.length, end + pad);
  return words
    .slice(lo, hi)
    .map((w) => w.text)
    .join(" ");
}

function route(confidence: number, negated: boolean): PipeRouting {
  if (negated) return "negated";
  if (confidence >= THRESHOLDS.auto_accept) return "auto";
  if (confidence >= THRESHOLDS.review) return "review";
  return "escalated";
}

let flatCache: FlatVariant[] | null = null;
function flatVariants(): FlatVariant[] {
  if (flatCache) return flatCache;
  const flat: FlatVariant[] = [];
  for (const cat of taxonomy.categories as {
    key: string;
    label: string;
    terms: { key: string; label: string; variants: string[] }[];
  }[]) {
    for (const term of cat.terms) {
      for (const variant of term.variants) {
        flat.push({
          catKey: cat.key,
          catLabel: cat.label,
          termKey: term.key,
          termLabel: term.label,
          variant,
          toks: variant.split(" ").map(norm),
        });
      }
    }
  }
  flat.sort((a, b) => b.toks.length - a.toks.length);
  flatCache = flat;
  return flat;
}

export function matchPage(
  words: PipeWord[],
  pageNumber: number,
  source: "text_layer" | "ocr",
  startIdx = 0
): PipeFinding[] {
  const normWords = words.map((w) => norm(w.text));
  const fuzzyMin = THRESHOLDS.fuzzy_min_ratio;
  const claimed = new Set<number>();
  const out: PipeFinding[] = [];
  let idx = startIdx;

  for (const v of flatVariants()) {
    let i = 0;
    while (i < normWords.length) {
      let overlaps = false;
      for (let k = 0; k < v.toks.length; k++) {
        if (claimed.has(i + k)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) {
        i += 1;
        continue;
      }
      const q = matchVariantAt(normWords, i, v.toks, fuzzyMin);
      if (q > 0) {
        const span = words.slice(i, i + v.toks.length);
        const ocrConf =
          Math.round(
            (span.reduce((s, w) => s + w.conf, 0) / span.length) * 10000
          ) / 10000;
        const srcFactor = source === "text_layer" ? 1.0 : 0.94;
        const confidence = Math.round(q * ocrConf * srcFactor * 10000) / 10000;
        const negated = isNegated(words, i);
        out.push({
          idx: idx++,
          category: v.catKey,
          category_label: v.catLabel,
          term_key: v.termKey,
          term_label: v.termLabel,
          variant: v.variant,
          page: pageNumber,
          match_quality: q,
          ocr_conf: ocrConf,
          source,
          negated,
          evidence: windowText(words, i, i + v.toks.length),
          rects: span.map((w) => [w.x0, w.y0, w.x1, w.y1]),
          confidence,
          routing: route(confidence, negated),
        });
        for (let k = 0; k < v.toks.length; k++) claimed.add(i + k);
        i += v.toks.length;
      } else {
        i += 1;
      }
    }
  }
  return out;
}

export const pipelineThresholds = THRESHOLDS;
