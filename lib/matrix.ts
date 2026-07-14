import matrixJson from "@/pipeline/casepipe/matrix.json";
import { supabase } from "@/lib/supabase";
import { DocMeta, Manifest } from "@/lib/demo";
import { CaseRecord, canonicalDrug, dateKey } from "@/lib/records";
import {
  buildCaseProfile, CaseProfile, Citation, EntryRouting,
} from "@/lib/case-profile";

/**
 * Settlement-matrix evaluator.
 *
 * This is the only place in the app that decides anything, and it is the one
 * place a model is not allowed to touch. `evaluate` is a pure function:
 *
 *     evaluate(records, matrix) -> scorecard
 *
 * Same records, same matrix version, same points — every time, on any machine.
 * The LLM extracts fields and writes prose; the rules file decides tiers. That
 * separation is not fussiness: a score that a language model produced is not
 * something a special master, a lien administrator, or opposing counsel will
 * accept, and it is not something a firm can allocate settlement funds against.
 *
 * Three principles carried over from the extraction stage:
 *
 *   1. No point without a citation. A factor that cannot name the record,
 *      page, and quote behind it does not score.
 *   2. INDETERMINATE is a first-class answer. "We cannot tell from these
 *      records" is the truth in a very large number of real cases, and it is
 *      the answer that tells the firm what to go and get.
 *   3. Confidence gates apply here too. A factor whose only support is
 *      low-confidence, unreviewed OCR text is WITHHELD, not guessed. Points
 *      inherit the routing discipline of the records beneath them.
 */

/* ------------------------------------------------------------------ *
 * Matrix schema
 * ------------------------------------------------------------------ */

export interface Band {
  min?: number;
  equals?: boolean;
  fallback?: boolean;
  points: number;
  label: string;
}

export type Rule =
  | { type: "administration_count"; drug: string }
  | { type: "exposure_documented"; drug: string }
  | { type: "diagnosis_present"; condition_key: string; icd10?: string }
  | { type: "diagnosis_after_exposure"; drug: string; condition_key: string }
  | { type: "measurement_threshold"; intervention_match: string; pattern: string; op: string; value: number }
  | { type: "exclusion_documented"; match: string }
  | { type: "causation_statements"; distinct_authors: boolean }
  | { type: "pre_exposure_absence"; drug: string; condition_match: string; months_before: number }
  | { type: "demographic_numeric"; field_match: string; op: string; value: number }
  | { type: "ongoing_therapy"; drug: string }
  | { type: "persistent_deficit"; condition_key: string; months_after_diagnosis: number; deficit_match: string; resolving_match?: string }
  | { type: "confounder_present"; field_match: string; value_match: string }
  | { type: "corroboration"; drug: string; min_sources: number };

export interface Factor {
  key: string;
  label: string;
  category: string;
  requirement: string;
  why_it_matters: string;
  rule: Rule;
  fallback_rule?: Rule;
  bands: Band[];
  evidence_needed?: string;
}

export interface Gate {
  key: string;
  label: string;
  requirement: string;
  rule: Rule;
  fallback_rule?: Rule;
  pass_when: { min?: number; equals?: boolean };
}

export interface Tier {
  key: string;
  label: string;
  min_points: number;
  description: string;
}

export interface Matrix {
  meta: { name: string; mdl: string; version: number; synthetic: boolean; disclaimer: string; note: string };
  tiers: Tier[];
  gates: Gate[];
  factors: Factor[];
}

export const MATRIX = matrixJson as unknown as Matrix;

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export type FactorStatus =
  | "met"            // scored at the top band
  | "partial"        // scored, but not at the top band
  | "not_met"        // scoreable factor that the records do not support
  | "clear"          // confounder checked for and absent — good news, worth zero
  | "adverse"        // confounder present: this factor scores against the case
  | "indeterminate"  // the records cannot answer it — go and get more
  | "withheld";      // answerable, but only from evidence no human has verified

export interface FactorResult {
  key: string;
  label: string;
  category: string;
  requirement: string;
  whyItMatters: string;
  status: FactorStatus;
  /** Points actually awarded. Indeterminate and withheld factors award nothing. */
  points: number;
  /** What the rule found, in plain words, with no model in the loop. */
  finding: string;
  bandLabel: string | null;
  citations: Citation[];
  weakestRouting: EntryRouting | null;
  /** Points at stake if this factor were resolved — the value of the missing evidence. */
  swing: number;
  bestCase: number;
  worstCase: number;
  evidenceNeeded: string | null;
}

export interface GateResult {
  key: string;
  label: string;
  requirement: string;
  passed: boolean;
  finding: string;
  citations: Citation[];
}

export interface Scorecard {
  matrixName: string;
  matrixVersion: number;
  synthetic: boolean;
  disclaimer: string;
  documents: number;
  records: number;
  gates: GateResult[];
  gatesPassed: boolean;
  factors: FactorResult[];
  points: number;
  /** Ceiling if every open factor resolved in the plaintiff's favour. */
  ceiling: number;
  /** Floor if every open factor resolved against. */
  floor: number;
  tier: Tier;
  ceilingTier: Tier;
  /** Open factors, ranked by how much they could move the score. */
  openItems: FactorResult[];
}

/* ------------------------------------------------------------------ *
 * Rule evaluation
 * ------------------------------------------------------------------ */

interface RuleOutcome {
  value: number | boolean;
  indeterminate: boolean;
  finding: string;
  citations: Citation[];
}

const rx = (s: string) => new RegExp(s, "i");
const live = <T extends { decision: string | null }>(xs: T[]) =>
  xs.filter((x) => x.decision !== "rejected");

/** Months between two MM/DD/YYYY strings, using the date keys we already have. */
function monthsBetween(a: string, b: string): number {
  const ka = dateKey(a);
  const kb = dateKey(b);
  if (!isFinite(ka) || !isFinite(kb)) return NaN;
  const ya = Math.floor(ka / 10000);
  const ma = Math.floor((ka % 10000) / 100);
  const yb = Math.floor(kb / 10000);
  const mb = Math.floor((kb % 10000) / 100);
  return (yb - ya) * 12 + (mb - ma);
}

function firstNumber(s: string): number | null {
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    default: return a === b;
  }
}

function evalRule(rule: Rule, p: CaseProfile): RuleOutcome {
  switch (rule.type) {
    case "administration_count": {
      const key = canonicalDrug(rule.drug).key;
      const hits = live(p.administrations).filter((a) => canonicalDrug(a.drug).key === key);
      const dates = hits.map((h) => h.date).filter(Boolean).sort((x, y) => dateKey(x) - dateKey(y));
      return {
        value: hits.length,
        indeterminate: false,
        finding: hits.length
          ? `${hits.length} documented administration(s), ${dates[0]} to ${dates[dates.length - 1]}.`
          : "No administration of this product is documented in the records reviewed.",
        citations: hits.flatMap((h) => h.citations),
      };
    }

    case "exposure_documented": {
      const key = canonicalDrug(rule.drug).key;
      const e = live(p.exposures).find((x) => canonicalDrug(x.drug).key === key);
      return {
        value: !!e,
        indeterminate: false,
        finding: e ? `Exposure to ${e.drug} is documented.` : "No exposure to this product is documented.",
        citations: e?.citations ?? [],
      };
    }

    case "diagnosis_present": {
      const d = live(p.diagnoses).find(
        (x) =>
          x.key === rule.condition_key ||
          (!!rule.icd10 && (x.icd10 ?? "").toUpperCase() === rule.icd10.toUpperCase())
      );
      return {
        value: !!d,
        indeterminate: false,
        finding: d
          ? `${d.condition}${d.icd10 ? ` (${d.icd10})` : ""} diagnosed${d.firstDocumented ? ` ${d.firstDocumented}` : ""}${d.confirmingTest ? `; confirmed by ${d.confirmingTest}` : ""}.`
          : "The qualifying diagnosis does not appear in the records reviewed.",
        citations: d?.citations ?? [],
      };
    }

    case "diagnosis_after_exposure": {
      const drugKey = canonicalDrug(rule.drug).key;
      const admins = live(p.administrations)
        .filter((a) => canonicalDrug(a.drug).key === drugKey)
        .map((a) => a.date)
        .filter(Boolean)
        .sort((x, y) => dateKey(x) - dateKey(y));
      const dx = live(p.diagnoses).find((x) => x.key === rule.condition_key);
      if (!admins.length || !dx?.firstDocumented) {
        return {
          value: false,
          indeterminate: true,
          finding: "Cannot establish temporal order — exposure or diagnosis is undated in these records.",
          citations: dx?.citations ?? [],
        };
      }
      const after = dateKey(dx.firstDocumented) > dateKey(admins[0]);
      return {
        value: after,
        indeterminate: false,
        finding: after
          ? `First exposure ${admins[0]}; diagnosis first documented ${dx.firstDocumented} — ${monthsBetween(admins[0], dx.firstDocumented)} months later.`
          : `Diagnosis (${dx.firstDocumented}) predates first documented exposure (${admins[0]}).`,
        citations: dx.citations,
      };
    }

    case "measurement_threshold": {
      const irx = rx(rule.intervention_match);
      const prx = rx(rule.pattern);
      for (const t of live(p.treatments)) {
        const hay = `${t.intervention} ${t.result ?? ""}`;
        if (!irx.test(hay)) continue;
        const m = hay.match(prx);
        if (!m) continue;
        const n = Number(m[1]);
        const ok = compare(n, rule.op, rule.value);
        return {
          value: ok,
          indeterminate: false,
          finding: `${t.intervention}${t.date ? ` (${t.date})` : ""}: measured ${n}, threshold ${rule.op} ${rule.value} — ${ok ? "met" : "not met"}.`,
          citations: t.citations,
        };
      }
      return {
        value: false,
        indeterminate: false,
        finding: "No qualifying measurement appears in the records reviewed.",
        citations: [],
      };
    }

    case "exclusion_documented": {
      const r = rx(rule.match);
      const hit = live(p.ruledOut).find((x) => r.test(`${x.condition} ${x.note ?? ""}`));
      return {
        value: !!hit,
        indeterminate: false,
        finding: hit
          ? `Excluded on the record: ${hit.condition}${hit.date ? ` (${hit.date})` : ""} — ${hit.note ?? ""}`
          : "The record set does not document exclusion of this alternative cause.",
        citations: hit?.citations ?? [],
      };
    }

    case "causation_statements": {
      const cs = live(p.causation);
      const authors = new Set(cs.map((c) => (c.author ?? "").toLowerCase()).filter(Boolean));
      const n = rule.distinct_authors ? authors.size : cs.length;
      return {
        value: n,
        indeterminate: false,
        finding: n
          ? `${n} treating clinician(s) attribute causation in the chart: ${[...authors].join("; ")}.`
          : "No treating clinician attributes causation in the records reviewed.",
        citations: cs.flatMap((c) => c.citations),
      };
    }

    case "pre_exposure_absence": {
      const drugKey = canonicalDrug(rule.drug).key;
      const firstAdmin = live(p.administrations)
        .filter((a) => canonicalDrug(a.drug).key === drugKey)
        .map((a) => a.date)
        .filter(Boolean)
        .sort((x, y) => dateKey(x) - dateKey(y))[0];
      if (!firstAdmin) {
        return { value: false, indeterminate: true, finding: "No dated exposure to anchor the window.", citations: [] };
      }
      // The earliest clinical event anywhere in the record set. If the records
      // do not reach back before the exposure window, absence cannot be proved
      // — and pretending otherwise is exactly the failure this engine exists to
      // prevent.
      const allDates = [
        ...live(p.administrations).map((a) => a.date),
        ...live(p.treatments).map((t) => t.date ?? ""),
        ...live(p.diagnoses).map((d) => d.firstDocumented ?? ""),
      ].filter((d) => d && isFinite(dateKey(d)));
      const earliest = allDates.sort((a, b) => dateKey(a) - dateKey(b))[0];
      const coverage = earliest ? monthsBetween(earliest, firstAdmin) : 0;

      if (!earliest || coverage < rule.months_before) {
        return {
          value: false,
          indeterminate: true,
          finding:
            `The earliest record in the file is dated ${earliest ?? "unknown"}, which is only ` +
            `${Math.max(0, coverage)} month(s) before first exposure (${firstAdmin}). ` +
            `${rule.months_before} months of pre-exposure coverage are required. Absence cannot be ` +
            `established from records that do not exist.`,
          citations: [],
        };
      }
      const r = rx(rule.condition_match);
      const priorDx = live(p.diagnoses).find(
        (d) => r.test(d.condition) && d.firstDocumented && dateKey(d.firstDocumented) < dateKey(firstAdmin)
      );
      return {
        value: !priorDx,
        indeterminate: false,
        finding: priorDx
          ? `Pre-exposure history documented: ${priorDx.condition} on ${priorDx.firstDocumented}.`
          : `Records cover ${coverage} months before first exposure with no documented history of the condition.`,
        citations: priorDx?.citations ?? [],
      };
    }

    case "demographic_numeric": {
      const r = rx(rule.field_match);
      const d = live(p.demographics).find((x) => r.test(x.field));
      if (!d) {
        return {
          value: false,
          indeterminate: true,
          finding: "This measurement does not appear anywhere in the records reviewed.",
          citations: [],
        };
      }
      const n = firstNumber(d.value);
      if (n === null) {
        return { value: false, indeterminate: true, finding: `"${d.value}" is not a numeric value.`, citations: d.citations };
      }
      const ok = compare(n, rule.op, rule.value);
      return {
        value: ok,
        indeterminate: false,
        finding: `${d.field}: ${d.value} — threshold ${rule.op} ${rule.value}, ${ok ? "met" : "not met"}.`,
        citations: d.citations,
      };
    }

    case "ongoing_therapy": {
      const key = canonicalDrug(rule.drug).key;
      const e = live(p.exposures).find((x) => canonicalDrug(x.drug).key === key);
      if (!e) {
        return { value: false, indeterminate: false, finding: "No disease-directed therapy documented.", citations: [] };
      }
      const ongoing = !e.discontinued;
      return {
        value: ongoing,
        indeterminate: false,
        finding: ongoing
          ? `${e.drug} started ${e.firstDocumented ?? "—"} with no discontinuation in the record — treatment is ongoing as of the latest document.`
          : `${e.drug} discontinued ${e.discontinued}.`,
        citations: e.citations,
      };
    }

    case "persistent_deficit": {
      // Anchor on the *qualifying* diagnosis, not the earliest dated diagnosis in
      // the chart. The problem list also carries an encounter code from 2021; if
      // permanence were measured from that, a one-month-old exam would look like
      // two years of follow-up. This is the kind of error that only shows up when
      // you make the engine explain itself.
      const dx = live(p.diagnoses)
        .filter((d) => d.key === rule.condition_key)
        .map((d) => d.firstDocumented)
        .filter((d): d is string => !!d && isFinite(dateKey(d)))
        .sort((a, b) => dateKey(a) - dateKey(b))[0];
      if (!dx) {
        return { value: false, indeterminate: true, finding: "No dated qualifying diagnosis to measure follow-up from.", citations: [] };
      }
      const followUps = live(p.treatments).filter(
        (t) => t.date && isFinite(dateKey(t.date)) && monthsBetween(dx, t.date) >= rule.months_after_diagnosis
      );
      if (followUps.length === 0) {
        const latest = live(p.treatments)
          .map((t) => t.date ?? "")
          .filter((d) => d && isFinite(dateKey(d)))
          .sort((a, b) => dateKey(b) - dateKey(a))[0];
        return {
          value: false,
          indeterminate: true,
          finding:
            `The most recent examination in the file is dated ${latest ?? "unknown"}, ` +
            `${latest ? monthsBetween(dx, latest) : 0} month(s) after diagnosis. Permanence cannot be ` +
            `established before ${rule.months_after_diagnosis} months, regardless of what that exam shows.`,
          citations: [],
        };
      }
      const r = rx(rule.deficit_match);
      const resolving = rule.resolving_match ? rx(rule.resolving_match) : null;
      const deficit = followUps.find((t) => {
        const hay = `${t.intervention} ${t.result ?? ""}`;
        // "Enlarged blind spot, improved" is a resolving finding, not a permanent
        // one. Matching the words without reading the verdict is how a keyword
        // system turns recovery into damages.
        return r.test(hay) && !(resolving && resolving.test(hay));
      });
      return {
        value: !!deficit,
        indeterminate: false,
        finding: deficit
          ? `Persistent deficit documented ${deficit.date}: ${deficit.result ?? deficit.intervention}`
          : "Follow-up beyond the permanence window shows no persistent deficit.",
        citations: deficit?.citations ?? followUps.flatMap((f) => f.citations).slice(0, 3),
      };
    }

    case "confounder_present": {
      const fr = rx(rule.field_match);
      const vr = rx(rule.value_match);
      const d = live(p.demographics).find((x) => fr.test(x.field) && vr.test(x.value));
      return {
        value: !!d,
        indeterminate: false,
        finding: d
          ? `${d.field}: ${d.value}`
          : "No competing etiology of this kind appears in the records reviewed.",
        citations: d?.citations ?? [],
      };
    }

    case "corroboration": {
      const key = canonicalDrug(rule.drug).key;
      const cites = [
        ...live(p.exposures).filter((x) => canonicalDrug(x.drug).key === key).flatMap((x) => x.citations),
        ...live(p.administrations).filter((x) => canonicalDrug(x.drug).key === key).flatMap((x) => x.citations),
      ];
      const docs = new Set(cites.map((c) => c.docId));
      return {
        value: docs.size >= rule.min_sources,
        indeterminate: false,
        finding: `Exposure appears in ${docs.size} independent document(s) in this file.`,
        citations: cites,
      };
    }
  }
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

const ROUTING_RANK: Record<EntryRouting, number> = { auto: 3, review: 2, escalated: 1 };

function pickBand(bands: Band[], value: number | boolean, usedFallback: boolean): Band | null {
  if (usedFallback) {
    const fb = bands.find((b) => b.fallback);
    if (fb) return fb;
  }
  for (const b of bands) {
    if (b.fallback) continue;
    if (typeof b.min === "number" && typeof value === "number" && value >= b.min) return b;
    if (typeof b.equals === "boolean" && typeof value === "boolean" && value === b.equals) return b;
  }
  return null;
}

/** Deduplicate citations and keep the strongest evidence first. */
function tidy(cs: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of cs) if (!seen.has(c.recordId)) seen.set(c.recordId, c);
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

function scoreFactor(f: Factor, p: CaseProfile): FactorResult {
  const best = Math.max(...f.bands.map((b) => b.points));
  const worst = Math.min(...f.bands.map((b) => b.points));

  let out = evalRule(f.rule, p);
  let usedFallback = false;
  if (!out.indeterminate && out.value === false && f.fallback_rule) {
    const fb = evalRule(f.fallback_rule, p);
    if (fb.value === true) {
      out = { ...fb, finding: `${out.finding} ${fb.finding}` };
      usedFallback = true;
    }
  }

  const citations = tidy(out.citations);
  const weakest =
    citations.length === 0
      ? null
      : citations.reduce((a, c) => (ROUTING_RANK[c.routing] < ROUTING_RANK[a.routing] ? c : a), citations[0])
          .routing;

  const base = {
    key: f.key,
    label: f.label,
    category: f.category,
    requirement: f.requirement,
    whyItMatters: f.why_it_matters,
    citations,
    weakestRouting: weakest,
    bestCase: best,
    worstCase: worst,
    evidenceNeeded: f.evidence_needed ?? null,
  };

  if (out.indeterminate) {
    return {
      ...base,
      status: "indeterminate",
      points: 0,
      finding: out.finding,
      bandLabel: null,
      swing: best - worst,
    };
  }

  const band = pickBand(f.bands, out.value, usedFallback);
  const points = band?.points ?? 0;

  // Confidence gate. A factor whose every source is low-confidence AND unreviewed
  // is withheld — the same rule the review queue applies to findings, now applied
  // to money. One auto-accepted source, or one a human approved, is enough to
  // release the points; nothing at all is not.
  const trustworthy = citations.some(
    (c) => c.routing === "auto" || c.decision === "approved" || c.decision === "corrected"
  );
  if (points > 0 && citations.length > 0 && !trustworthy) {
    return {
      ...base,
      status: "withheld",
      points: 0,
      finding:
        `${out.finding} Every source for this factor is low-confidence (${weakest}) and unreviewed, ` +
        `so the points are withheld pending human verification.`,
      bandLabel: band?.label ?? null,
      swing: best,
    };
  }

  // A factor that scores points must be able to name its evidence.
  if (points > 0 && citations.length === 0) {
    return {
      ...base,
      status: "indeterminate",
      points: 0,
      finding: `${out.finding} No citable record supports this factor, so it does not score.`,
      bandLabel: null,
      swing: best - worst,
    };
  }

  // A confounder that scores nothing because it is absent is *good news*, and
  // calling that "met" the way a scored factor is "met" makes the grid unreadable.
  const status: FactorStatus =
    points < 0
      ? "adverse"
      : points === 0 && best <= 0
        ? "clear"
        : points === 0
          ? "not_met"
          : points === best
            ? "met"
            : "partial";

  return {
    ...base,
    status,
    points,
    finding: out.finding,
    bandLabel: band?.label ?? null,
    swing: 0,
  };
}

function tierFor(points: number, tiers: Tier[]): Tier {
  return (
    [...tiers].sort((a, b) => b.min_points - a.min_points).find((t) => points >= t.min_points) ??
    tiers[tiers.length - 1]
  );
}

export function evaluate(profile: CaseProfile, matrix: Matrix = MATRIX): Scorecard {
  const gates: GateResult[] = matrix.gates.map((g) => {
    let out = evalRule(g.rule, profile);
    if (out.value === false && g.fallback_rule) {
      const fb = evalRule(g.fallback_rule, profile);
      if (fb.value === true) out = fb;
    }
    const passed =
      typeof g.pass_when.min === "number"
        ? typeof out.value === "number" && out.value >= g.pass_when.min
        : out.value === g.pass_when.equals;
    return {
      key: g.key,
      label: g.label,
      requirement: g.requirement,
      passed,
      finding: out.finding,
      citations: tidy(out.citations),
    };
  });

  const factors = matrix.factors.map((f) => scoreFactor(f, profile));
  const points = factors.reduce((n, f) => n + f.points, 0);
  const open = factors.filter((f) => f.status === "indeterminate" || f.status === "withheld");
  const ceiling = points + open.reduce((n, f) => n + (f.bestCase - f.points), 0);
  const floor = points + open.reduce((n, f) => n + (f.worstCase - f.points), 0);

  return {
    matrixName: matrix.meta.name,
    matrixVersion: matrix.meta.version,
    synthetic: matrix.meta.synthetic,
    disclaimer: matrix.meta.disclaimer,
    documents: profile.totals.documents,
    records: profile.totals.records,
    gates,
    gatesPassed: gates.every((g) => g.passed),
    factors,
    points,
    ceiling,
    floor,
    tier: tierFor(points, matrix.tiers),
    ceilingTier: tierFor(ceiling, matrix.tiers),
    openItems: [...open].sort((a, b) => b.swing - a.swing),
  };
}

/* ------------------------------------------------------------------ *
 * The timeline — what each document was worth
 *
 * Because the score is a pure function of the record set, it can be replayed
 * over the documents in the order the firm actually received them. That is not
 * a simulation: it is the same evaluator, run against progressively larger
 * subsets of the real records. It answers the question every intake lead asks —
 * "what did this document change?" — and it is what a new ingest extends.
 * ------------------------------------------------------------------ */

export interface TimelineStep {
  docId: string;
  docTitle: string;
  facility: string;
  received: string;
  records: number;
  points: number;
  pointsDelta: number;
  tier: Tier;
  tierChanged: boolean;
  /** Factors whose status changed when this document landed. */
  changes: { key: string; label: string; from: FactorStatus | "—"; to: FactorStatus; delta: number }[];
}

export function evaluateTimeline(
  manifest: Manifest,
  records: Map<string, CaseRecord[]>,
  matrix: Matrix = MATRIX
): TimelineStep[] {
  const ordered: DocMeta[] = [...manifest.documents].sort(
    (a, b) => (a.received < b.received ? -1 : a.received > b.received ? 1 : 0)
  );

  const steps: TimelineStep[] = [];
  let prev: Scorecard | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const subset = ordered.slice(0, i + 1);
    const subMap = new Map(subset.map((d) => [d.id, records.get(d.id) ?? []]));
    const profile = buildCaseProfile({ ...manifest, documents: subset }, subMap);
    const card = evaluate(profile, matrix);
    const doc = ordered[i];

    const changes: TimelineStep["changes"] = [];
    for (const f of card.factors) {
      const before = prev?.factors.find((x) => x.key === f.key);
      if (!before || before.status !== f.status || before.points !== f.points) {
        changes.push({
          key: f.key,
          label: f.label,
          from: before?.status ?? "—",
          to: f.status,
          delta: f.points - (before?.points ?? 0),
        });
      }
    }

    steps.push({
      docId: doc.id,
      docTitle: doc.title,
      facility: doc.facility,
      received: doc.received,
      records: (records.get(doc.id) ?? []).length,
      points: card.points,
      pointsDelta: card.points - (prev?.points ?? 0),
      tier: card.tier,
      tierChanged: !!prev && prev.tier.key !== card.tier.key,
      changes: changes.filter((c) => c.delta !== 0 || c.to !== "not_met"),
    });
    prev = card;
  }
  return steps;
}


/** Pin a scorecard to the append-only history. Best-effort, like the audit log:
 *  a database hiccup must never block a lawyer from getting their document. */
export async function snapshotScore(
  matterId: string,
  card: Scorecard,
  triggerDoc: string | null = null,
  actor = "Ops Reviewer (demo)"
): Promise<boolean> {
  try {
    const { error } = await supabase().from("case_scores").insert({
      matter_id: matterId,
      matrix_name: card.matrixName,
      matrix_version: card.matrixVersion,
      documents: card.documents,
      records: card.records,
      points: card.points,
      floor_points: card.floor,
      ceiling_points: card.ceiling,
      tier: card.tier.label,
      ceiling_tier: card.ceilingTier.label,
      gates_passed: card.gatesPassed,
      open_factors: card.openItems.length,
      scorecard: card,
      trigger_doc: triggerDoc,
      actor,
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
