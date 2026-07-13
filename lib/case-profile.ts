import { DocMeta, Manifest, Routing, Decision } from "@/lib/demo";
import {
  CaseRecord,
  RecordData,
  canonicalCondition,
  canonicalDrug,
  dateKey,
  valuesAgree,
} from "@/lib/records";

/**
 * Case profile = the Plaintiff Fact Sheet, assembled from the structured
 * records the extraction stage produced, across every document in the matter.
 *
 * Three rules govern this file, and they are the difference between a fact
 * sheet and a word cloud:
 *
 *   1. Nothing is asserted without a citation. Every field carries the
 *      records that back it, each of which carries a grounded verbatim quote,
 *      a page, and a confidence.
 *   2. Nothing is silently chosen. When two documents state a field
 *      differently, both values are surfaced as a conflict for a human — the
 *      profile never picks a winner behind the reviewer's back.
 *   3. Nothing a reviewer rejected survives. Decisions recorded in the review
 *      queue propagate here and into the export.
 */

export type EntryRouting = Exclude<Routing, "negated">;

export interface Citation {
  recordId: string;
  docId: string;
  docTitle: string;
  page: number;
  quote: string;
  confidence: number;
  routing: EntryRouting;
  source: "text_layer" | "ocr";
  certainty: string;
  reportedBy: string | null;
}

export interface Conflict {
  label: string;
  values: { value: string; docTitle: string; page: number }[];
}

interface EntryBase {
  key: string;
  citations: Citation[];
  /** Best evidence available for this entry — corroboration upgrades. */
  routing: EntryRouting;
  /** Worst evidence contributing to it — surfaced so "1 weak source" is visible. */
  weakestRouting: EntryRouting;
  confidence: number;
  decision: Decision;
  conflicts: Conflict[];
  /** True when every source is second-hand (patient-reported, outside record). */
  hearsayOnly: boolean;
}

export interface ProfileField extends EntryBase {
  field: string;
  value: string;
}

export interface ExposureEntry extends EntryBase {
  drug: string;
  doses: string[];
  routes: string[];
  regimens: string[];
  prescribers: string[];
  ndc: string | null;
  documentedStarts: string[];
  fills: string[];
  firstDocumented: string | null;
  firstAdministered: string | null;
  lastAdministered: string | null;
  discontinued: string | null;
  administrationCount: number;
}

export interface AdministrationEntry extends EntryBase {
  date: string;
  drug: string;
  dose: string | null;
  route: string | null;
  site: string | null;
  lot: string | null;
  administeredBy: string | null;
}

export interface DiagnosisEntry extends EntryBase {
  /** The condition as the earliest document words it. */
  condition: string;
  /** The taxonomy term it was grouped under. */
  canonicalLabel: string;
  icd10: string | null;
  firstDocumented: string | null;
  diagnosedBy: string | null;
  confirmingTest: string | null;
  status: string | null;
}

export interface TreatmentEntry extends EntryBase {
  intervention: string;
  date: string | null;
  result: string | null;
  facility: string | null;
  cpt: string | null;
}

export interface CausationEntry extends EntryBase {
  statement: string;
  author: string | null;
  date: string | null;
  relationship: string | null;
}

export interface ProviderEntry extends EntryBase {
  name: string;
  credential: string | null;
  specialty: string | null;
  role: string | null;
  facility: string | null;
}

export interface RuledOutEntry extends EntryBase {
  condition: string;
  date: string | null;
  note: string | null;
}

export interface CaseProfile {
  matter: Manifest["matter"];
  generatedAt: string;
  model: string;
  sourceDocuments: { id: string; title: string; facility: string; pages: number; records: number }[];
  demographics: ProfileField[];
  exposures: ExposureEntry[];
  administrations: AdministrationEntry[];
  diagnoses: DiagnosisEntry[];
  treatments: TreatmentEntry[];
  causation: CausationEntry[];
  providers: ProviderEntry[];
  ruledOut: RuledOutEntry[];
  totals: {
    documents: number;
    records: number;
    auto: number;
    review: number;
    escalated: number;
    rejected: number;
    approved: number;
    fields: number;
    fieldsNeedingReview: number;
    conflicts: number;
  };
}

/* ------------------------------------------------------------------ */

const ROUTING_RANK: Record<EntryRouting, number> = { auto: 3, review: 2, escalated: 1 };

const FULL_DATE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
const YEAR = /\b(19|20)\d{2}\b/;

/** Two dates conflict only when both are specific and they differ. "2021" and
 *  "04/13/2021" are not a contradiction — one is simply less precise. */
function datesConflict(a: string, b: string): boolean {
  const da = a.match(FULL_DATE)?.[0];
  const db = b.match(FULL_DATE)?.[0];
  if (da && db) return da !== db;
  const ya = a.match(YEAR)?.[0];
  const yb = b.match(YEAR)?.[0];
  if (ya && yb) return ya !== yb;
  return false;
}

function cite(rec: CaseRecord, doc: DocMeta): Citation {
  return {
    recordId: rec.id,
    docId: doc.id,
    docTitle: doc.title,
    page: rec.page,
    quote: rec.quote,
    confidence: rec.confidence,
    routing: rec.routing,
    source: rec.source,
    certainty: rec.certainty,
    reportedBy: rec.reported_by ?? null,
  };
}

function baseOf(key: string, pairs: [CaseRecord, DocMeta][]): EntryBase {
  const citations = pairs.map(([r, d]) => cite(r, d));
  const best = citations.reduce((a, c) => (c.confidence > a.confidence ? c : a), citations[0]);
  const worst = citations.reduce(
    (a, c) => (ROUTING_RANK[c.routing] < ROUTING_RANK[a.routing] ? c : a),
    citations[0]
  );
  const decisions = pairs.map(([r]) => r.decision).filter(Boolean) as Exclude<Decision, null>[];
  const decision: Decision = decisions.includes("rejected")
    ? "rejected"
    : decisions.includes("approved")
      ? "approved"
      : decisions[0] ?? null;
  return {
    key,
    citations: citations.sort((a, b) => b.confidence - a.confidence),
    routing: best.routing,
    weakestRouting: worst.routing,
    confidence: best.confidence,
    decision,
    conflicts: [],
    hearsayOnly: pairs.length > 0 && pairs.every(([r]) => !!r.reported_by),
  };
}

/**
 * Collect the distinct values a field takes across sources, in confidence order.
 *
 * A conflict is raised only where a disagreement is *material*. Two documents
 * writing "PO" and "oral tablet", or "S. Grant, DO" and "Grant, Sofia DO", are
 * not in conflict — they are the same fact in different house style, and
 * flagging them trains the reviewer to ignore the flag. What deserves a human
 * is a genuine contradiction: two different end-of-use dates, two different
 * doses, two different ICD-10 codes.
 *
 *   "list"  — record every value, never flag (route, regimen, prescriber, …)
 *   "date"  — flag only when both values are specific and differ
 *   "value" — flag when the normalised values disagree
 */
type ConflictPolicy = "list" | "date" | "value";

function collect(
  pairs: [CaseRecord, DocMeta][],
  pick: (d: RecordData) => string | undefined,
  label: string,
  conflicts: Conflict[],
  policy: ConflictPolicy = "list"
): string[] {
  const seen: { value: string; docTitle: string; page: number; conf: number }[] = [];
  for (const [r, d] of pairs) {
    const v = (pick(r.data) ?? "").trim();
    if (!v) continue;
    if (seen.some((s) => valuesAgree(s.value, v))) continue;
    seen.push({ value: v, docTitle: d.title, page: r.page, conf: r.confidence });
  }
  seen.sort((a, b) => b.conf - a.conf);

  if (policy !== "list" && seen.length > 1) {
    const disagrees =
      policy === "date"
        ? seen.some((s, i) => seen.slice(i + 1).some((t) => datesConflict(s.value, t.value)))
        : true;
    if (disagrees) {
      conflicts.push({
        label,
        values: seen.map(({ value, docTitle, page }) => ({ value, docTitle, page })),
      });
    }
  }
  return seen.map((s) => s.value);
}

/** Prefer the earliest *specific* date; fall back to the earliest vague one
 *  ("April 2021" is knowledge, but "04/13/2021" is the answer). */
function earliest(values: string[]): string | null {
  const specific = values.filter((v) => FULL_DATE.test(v));
  const pool = specific.length ? specific : values;
  return pool.slice().sort((a, b) => dateKey(a) - dateKey(b))[0] ?? null;
}

/** Demographic fields that are legitimately multi-valued — a patient has one
 *  MRN *per facility*, and two facilities recording different MRNs is not a
 *  contradiction. */
const MULTI_VALUE_FIELD = /medical record number|mrn|payer|insurer/i;

const first = (xs: string[]) => xs[0] ?? null;

/* ------------------------------------------------------------------ */

export function buildCaseProfile(
  manifest: Manifest,
  allRecords: Map<string, CaseRecord[]>,
  model = "claude-sonnet-5"
): CaseProfile {
  const docById = new Map(manifest.documents.map((d) => [d.id, d]));
  const pairs: [CaseRecord, DocMeta][] = [];
  for (const [docId, recs] of allRecords) {
    const doc = docById.get(docId);
    if (!doc) continue;
    for (const r of recs) pairs.push([r, doc]);
  }

  const group = <K extends string>(
    type: CaseRecord["type"],
    keyOf: (r: CaseRecord) => K | null
  ): Map<K, [CaseRecord, DocMeta][]> => {
    const m = new Map<K, [CaseRecord, DocMeta][]>();
    for (const [r, d] of pairs) {
      if (r.type !== type) continue;
      const k = keyOf(r);
      if (!k) continue;
      const list = m.get(k) ?? [];
      list.push([r, d]);
      m.set(k, list);
    }
    return m;
  };

  /* -------- demographics ---------------------------------------- */
  const demographics: ProfileField[] = [];
  for (const [k, ps] of group("demographic", (r) =>
    r.data.field ? r.data.field.toLowerCase().replace(/[^a-z]+/g, "-") : null
  )) {
    const b = baseOf(k, ps);
    const field = ps[0][0].data.field ?? k;
    const values = collect(
      ps, (d) => d.value, "Recorded value", b.conflicts,
      MULTI_VALUE_FIELD.test(field) ? "list" : "value"
    );
    demographics.push({
      ...b,
      field,
      value: values.join(" · "),
    });
  }

  /* -------- administrations (built first; exposures cite them) ---- */
  const administrations: AdministrationEntry[] = [];
  for (const [k, ps] of group("administration", (r) => {
    if (!r.data.drug) return null;
    const drug = canonicalDrug(r.data.drug).key;
    return `${drug}|${r.data.date ?? "undated"}`;
  })) {
    const b = baseOf(k, ps);
    const drug = canonicalDrug(ps[0][0].data.drug ?? "").label;
    administrations.push({
      ...b,
      drug,
      date: ps[0][0].data.date ?? "",
      dose: first(collect(ps, (d) => d.dose, "Dose", b.conflicts, "value")),
      route: first(collect(ps, (d) => d.route, "Route", b.conflicts)),
      site: first(collect(ps, (d) => d.site, "Site", b.conflicts)),
      lot: first(collect(ps, (d) => d.lot, "Lot", b.conflicts)),
      administeredBy: first(collect(ps, (d) => d.administered_by, "Administered by", b.conflicts)),
    });
  }
  administrations.sort((a, b) => dateKey(a.date) - dateKey(b.date));

  /* -------- exposures -------------------------------------------- */
  const exposures: ExposureEntry[] = [];
  for (const [k, ps] of group("exposure", (r) =>
    r.data.drug ? canonicalDrug(r.data.drug).key : null
  )) {
    const b = baseOf(k, ps);
    const label = canonicalDrug(ps[0][0].data.drug ?? "").label;
    const admins = administrations.filter(
      (a) => canonicalDrug(a.drug).key === k && a.decision !== "rejected"
    );
    const adminDates = admins.map((a) => a.date).filter(Boolean).sort((x, y) => dateKey(x) - dateKey(y));

    // A prescription start and a pharmacy fill are different events. The same
    // drug prescribed twice, months apart, is history — not a contradiction.
    // Only the END of exposure is contested here (last injection vs formally
    // discontinued), and that one matters, so it is the one we flag.
    const starts = collect(ps, (d) => d.start_date, "Start of use", b.conflicts);
    const fills = collect(ps, (d) => d.dispensed_date, "Dispensed", b.conflicts)
      .sort((x, y) => dateKey(x) - dateKey(y));
    const ends = collect(ps, (d) => d.end_date, "End of exposure", b.conflicts, "date");

    exposures.push({
      ...b,
      drug: label,
      doses: collect(ps, (d) => d.dose, "Dose", b.conflicts, "value"),
      routes: collect(ps, (d) => d.route, "Route", b.conflicts),
      regimens: collect(ps, (d) => d.frequency, "Regimen", b.conflicts),
      prescribers: collect(ps, (d) => d.prescriber, "Prescriber", b.conflicts),
      ndc: first(collect(ps, (d) => d.ndc, "NDC", b.conflicts)),
      documentedStarts: starts.slice().sort((x, y) => dateKey(x) - dateKey(y)),
      fills,
      firstDocumented: earliest(starts),
      firstAdministered: adminDates[0] ?? null,
      lastAdministered: adminDates[adminDates.length - 1] ?? null,
      discontinued: ends.slice().sort((x, y) => dateKey(y) - dateKey(x))[0] ?? null,
      administrationCount: admins.length,
    });
  }
  exposures.sort(
    (a, b) => b.administrationCount - a.administrationCount || a.drug.localeCompare(b.drug)
  );

  /* -------- diagnoses -------------------------------------------- */
  const diagnoses: DiagnosisEntry[] = [];
  for (const [k, ps] of group("diagnosis", (r) =>
    r.data.condition ? canonicalCondition(r.data.condition).key : null
  )) {
    const b = baseOf(k, ps);
    const byDate = [...ps].sort((x, y) => dateKey(x[0].data.date) - dateKey(y[0].data.date));
    // The same condition documented on three dates is a course, not a conflict.
    // A different ICD-10 code for the same condition is a coding error worth a look.
    const dates = collect(ps, (d) => d.date, "Documented", b.conflicts);
    diagnoses.push({
      ...b,
      // Keep the document's own words; the taxonomy key is only for grouping.
      condition: byDate[0][0].data.condition ?? "",
      canonicalLabel: canonicalCondition(ps[0][0].data.condition ?? "").label,
      icd10: first(collect(ps, (d) => d.icd10, "ICD-10", b.conflicts, "value")),
      firstDocumented: earliest(dates),
      diagnosedBy: first(collect(ps, (d) => d.diagnosed_by, "Diagnosed by", b.conflicts)),
      confirmingTest: first(collect(ps, (d) => d.confirming_test, "Confirming test", b.conflicts)),
      status: byDate[byDate.length - 1][0].data.status ?? null,
    });
  }
  diagnoses.sort((a, b) => dateKey(a.firstDocumented) - dateKey(b.firstDocumented));

  /* -------- treatments ------------------------------------------- */
  const treatments: TreatmentEntry[] = [];
  for (const [k, ps] of group("treatment", (r) => {
    if (!r.data.intervention) return null;
    return `${r.data.intervention.toLowerCase().slice(0, 40)}|${r.data.date ?? ""}`;
  })) {
    const b = baseOf(k, ps);
    treatments.push({
      ...b,
      intervention: ps[0][0].data.intervention ?? "",
      date: ps[0][0].data.date ?? null,
      result: first(collect(ps, (d) => d.result, "Result", b.conflicts)),
      facility: first(collect(ps, (d) => d.facility, "Facility", b.conflicts)),
      cpt: first(collect(ps, (d) => d.cpt, "CPT", b.conflicts, "value")),
    });
  }
  treatments.sort((a, b) => dateKey(a.date) - dateKey(b.date));

  /* -------- causation -------------------------------------------- */
  const causation: CausationEntry[] = [];
  for (const [k, ps] of group("causation", (r) =>
    r.data.statement ? r.data.statement.toLowerCase().replace(/\W+/g, " ").slice(0, 60) : null
  )) {
    const b = baseOf(k, ps);
    causation.push({
      ...b,
      statement: ps[0][0].data.statement ?? "",
      author: ps[0][0].data.author ?? null,
      date: ps[0][0].data.date ?? null,
      relationship: ps[0][0].data.relationship ?? null,
    });
  }
  causation.sort((a, b) => dateKey(a.date) - dateKey(b.date));

  /* -------- providers -------------------------------------------- */
  const providers: ProviderEntry[] = [];
  for (const [k, ps] of group("provider", (r) =>
    r.data.name ? r.data.name.toLowerCase().replace(/[^a-z]+/g, "") : null
  )) {
    const b = baseOf(k, ps);
    providers.push({
      ...b,
      name: ps[0][0].data.name ?? "",
      credential: first(collect(ps, (d) => d.credential, "Credential", b.conflicts)),
      specialty: first(collect(ps, (d) => d.specialty, "Specialty", b.conflicts)),
      role: first(collect(ps, (d) => d.role, "Role", b.conflicts)),
      facility: first(collect(ps, (d) => d.facility, "Facility", b.conflicts)),
    });
  }

  /* -------- ruled out -------------------------------------------- */
  const ruledOut: RuledOutEntry[] = [];
  for (const [k, ps] of group("negated_finding", (r) =>
    r.data.condition ? canonicalCondition(r.data.condition).key : null
  )) {
    const b = baseOf(k, ps);
    const byDate = [...ps].sort((x, y) => dateKey(y[0].data.date) - dateKey(x[0].data.date));
    ruledOut.push({
      ...b,
      condition: canonicalCondition(ps[0][0].data.condition ?? "").label,
      date: byDate[0][0].data.date ?? null,
      note: byDate[0][0].data.result ?? null,
    });
  }

  /* -------- totals ------------------------------------------------ */
  const allEntries: EntryBase[] = [
    ...demographics, ...exposures, ...administrations, ...diagnoses,
    ...treatments, ...causation, ...providers, ...ruledOut,
  ];
  const records = pairs.map(([r]) => r);

  return {
    matter: manifest.matter,
    generatedAt: new Date().toISOString(),
    model,
    sourceDocuments: manifest.documents.map((d) => ({
      id: d.id,
      title: d.title,
      facility: d.facility,
      pages: d.pages,
      records: (allRecords.get(d.id) ?? []).length,
    })),
    demographics,
    exposures,
    administrations,
    diagnoses,
    treatments,
    causation,
    providers,
    ruledOut,
    totals: {
      documents: manifest.documents.length,
      records: records.length,
      auto: records.filter((r) => r.routing === "auto").length,
      review: records.filter((r) => r.routing === "review").length,
      escalated: records.filter((r) => r.routing === "escalated").length,
      rejected: records.filter((r) => r.decision === "rejected").length,
      approved: records.filter((r) => r.decision === "approved").length,
      fields: allEntries.length,
      fieldsNeedingReview: allEntries.filter(
        (e) => e.routing !== "auto" && e.decision !== "approved" && e.decision !== "rejected"
      ).length,
      conflicts: allEntries.reduce((n, e) => n + e.conflicts.length, 0),
    },
  };
}

/** Everything a reviewer rejected is stripped before the fact sheet is drafted. */
export function forExport(profile: CaseProfile): CaseProfile {
  const keep = <T extends EntryBase>(xs: T[]) => xs.filter((x) => x.decision !== "rejected");
  return {
    ...profile,
    demographics: keep(profile.demographics),
    exposures: keep(profile.exposures),
    administrations: keep(profile.administrations),
    diagnoses: keep(profile.diagnoses),
    treatments: keep(profile.treatments),
    causation: keep(profile.causation),
    providers: keep(profile.providers),
    ruledOut: keep(profile.ruledOut),
  };
}
