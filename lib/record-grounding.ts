import spec from "@/pipeline/casepipe/record_spec.json";
import type { PipeWord } from "@/lib/client-pipeline";
import type { CaseRecord, RecordData, RecordType } from "@/lib/records";

/**
 * TypeScript port of pipeline/casepipe/records.py.
 *
 * Same rule, same numbers: the model does not get to assert anything the page
 * does not say. A record whose quote cannot be located in the page word stream
 * is dropped, and a record read off a page the OCR could barely resolve is not
 * allowed to be confident.
 *
 * (The repo already ports match.py to client-pipeline.ts for the same reason —
 * the browser demo must produce the numbers the batch pipeline produces. This
 * file keeps that property for the extraction stage. record_spec.json is the
 * single source of truth both sides read, so thresholds cannot drift.)
 */

const CFG = spec.confidence;
const CERTAINTY = CFG.certainty_weight as Record<string, number>;

const norm = (t: string) => t.toLowerCase().replace(/[^\w./-]+/g, "");

const tokens = (s: string) => s.split(/\s+/).map(norm).filter(Boolean);

/** InDel ratio, matching rapidfuzz.fuzz.ratio — same implementation the
 *  term matcher uses, so grounding and matching are measured the same way. */
function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 100;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1).fill(0);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = 0;
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  const lcs = prev[n];
  return (2 * lcs * 100) / (m + n);
}

function spanQuality(pageToks: string[], start: number, quoteToks: string[], fuzzyMin: number): number {
  const n = quoteToks.length;
  if (start + n > pageToks.length) return 0;
  let sum = 0;
  let exact = true;
  for (let k = 0; k < n; k++) {
    const a = pageToks[start + k];
    const b = quoteToks[k];
    if (a === b) {
      sum += 1;
      continue;
    }
    exact = false;
    if (b.length < 4) return 0;
    const r = ratio(a, b);
    if (r < fuzzyMin) return 0;
    sum += r / 100;
  }
  return exact ? 1 : Math.round((sum / n) * 0.97 * 10000) / 10000;
}

export interface GroundingResult {
  grounding: number;
  start: number;
  end: number;
}

export function locateQuote(words: PipeWord[], quote: string, fuzzyMin: number): GroundingResult {
  const quoteToks = tokens(quote);
  if (!quoteToks.length) return { grounding: 0, start: -1, end: -1 };

  const pageToks: string[] = [];
  const wordIndex: number[] = [];
  words.forEach((w, i) => {
    const t = norm(w.text);
    if (t) {
      pageToks.push(t);
      wordIndex.push(i);
    }
  });
  if (pageToks.length < quoteToks.length) return { grounding: 0, start: -1, end: -1 };

  let best: GroundingResult = { grounding: 0, start: -1, end: -1 };
  for (let i = 0; i <= pageToks.length - quoteToks.length; i++) {
    if (pageToks[i] !== quoteToks[0] && ratio(pageToks[i], quoteToks[0]) < fuzzyMin) continue;
    const q = spanQuality(pageToks, i, quoteToks, fuzzyMin);
    if (q > best.grounding) {
      best = {
        grounding: q,
        start: wordIndex[i],
        end: wordIndex[i + quoteToks.length - 1] + 1,
      };
      if (q === 1) break;
    }
  }
  return best;
}

/** One rect per visual line, so a highlight doesn't smear across the page. */
function rectsFor(words: PipeWord[], start: number, end: number): number[][] {
  if (start < 0) return [];
  const lines: PipeWord[][] = [];
  for (const w of words.slice(start, end)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[last.length - 1].y0 - w.y0) < 3) last.push(w);
    else lines.push([w]);
  }
  return lines.map((line) => [
    Math.min(...line.map((w) => w.x0)),
    Math.min(...line.map((w) => w.y0)),
    Math.max(...line.map((w) => w.x1)),
    Math.max(...line.map((w) => w.y1)),
  ]);
}

export function routeRecord(confidence: number): CaseRecord["routing"] {
  if (confidence >= CFG.thresholds.auto_accept) return "auto";
  if (confidence >= CFG.thresholds.review) return "review";
  return "escalated";
}

export interface ExtractionPage {
  number: number;
  source: "text_layer" | "ocr";
  mean_conf: number;
  words: PipeWord[];
}

export interface RawRecord {
  type: RecordType;
  page: number;
  quote: string;
  certainty: "high" | "medium" | "low";
  reported_by?: string;
  data: RecordData;
}

export interface GroundedOutput {
  records: CaseRecord[];
  rejected: { reason: string; grounding: number; record: RawRecord }[];
}

export function groundRecords(
  docId: string,
  pages: ExtractionPage[],
  raw: RawRecord[]
): GroundedOutput {
  const byNumber = new Map(pages.map((p) => [p.number, p]));
  const records: CaseRecord[] = [];
  const rejected: GroundedOutput["rejected"] = [];

  raw.forEach((r, i) => {
    const page = byNumber.get(Number(r.page));
    if (!page) {
      rejected.push({ reason: "page_out_of_range", grounding: 0, record: r });
      return;
    }
    const { grounding, start, end } = locateQuote(page.words, r.quote ?? "", CFG.fuzzy_min_ratio);
    if (grounding < CFG.min_grounding) {
      rejected.push({ reason: "quote_not_grounded", grounding, record: r });
      return;
    }
    const quoted = page.words.slice(start, end);
    const wordConf = quoted.length
      ? quoted.reduce((s, w) => s + w.conf, 0) / quoted.length
      : 0;
    const certainty = CERTAINTY[r.certainty] ?? CERTAINTY.medium;
    const sourceFactor = CFG.source_factor[page.source];
    const confidence =
      Math.round(certainty * grounding * page.mean_conf * sourceFactor * 10000) / 10000;

    const data = Object.fromEntries(
      Object.entries(r.data ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "")
    ) as RecordData;

    records.push({
      id: `${docId}:${i}`,
      type: r.type,
      page: page.number,
      quote: r.quote,
      matched_text: quoted.map((w) => w.text).join(" "),
      certainty: r.certainty,
      reported_by: r.reported_by || null,
      data,
      grounding,
      source: page.source,
      page_conf: Math.round(page.mean_conf * 10000) / 10000,
      word_conf: Math.round(wordConf * 10000) / 10000,
      confidence,
      routing: routeRecord(confidence),
      rects: rectsFor(page.words, start, end),
      decision: null,
    });
  });

  return { records, rejected };
}
