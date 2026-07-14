import taxonomy from "@/pipeline/casepipe/terms.json";
import { supabase } from "./supabase";
import { DocMeta, Routing, Decision } from "./demo";

/**
 * A structured record produced by the LLM extraction stage and grounded
 * against the page word stream (pipeline/casepipe/records.py). Unlike a
 * finding — which only asserts "this term appears here" — a record asserts
 * "this is the drug, this is the dose, this is who prescribed it", which is
 * what a Plaintiff Fact Sheet actually needs.
 */
export type RecordType =
  | "demographic"
  | "exposure"
  | "administration"
  | "diagnosis"
  | "treatment"
  | "causation"
  | "provider"
  | "negated_finding";

export interface RecordData {
  field?: string;
  value?: string;
  drug?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  start_date?: string;
  dispensed_date?: string;
  end_date?: string;
  prescriber?: string;
  ndc?: string;
  lot?: string;
  site?: string;
  administered_by?: string;
  date?: string;
  facility?: string;
  condition?: string;
  icd10?: string;
  status?: string;
  diagnosed_by?: string;
  confirming_test?: string;
  intervention?: string;
  result?: string;
  cpt?: string;
  statement?: string;
  relationship?: string;
  author?: string;
  name?: string;
  credential?: string;
  specialty?: string;
  role?: string;
  npi?: string;
  phone?: string;
  address?: string;
}

export interface CaseRecord {
  id: string;
  type: RecordType;
  page: number;
  quote: string;
  matched_text: string;
  certainty: "high" | "medium" | "low";
  reported_by: string | null;
  data: RecordData;
  grounding: number;
  source: "text_layer" | "ocr";
  page_conf: number;
  word_conf: number;
  confidence: number;
  routing: Exclude<Routing, "negated">;
  rects: number[][];
  decision?: Decision;
  decided_by?: string | null;
}

export interface RecordsFile {
  document_id: string;
  model: string;
  spec_version: number;
  counts: {
    proposed: number;
    grounded: number;
    rejected: number;
    auto: number;
    review: number;
    escalated: number;
  };
  records: CaseRecord[];
  rejected: { reason: string; grounding?: number; record: unknown }[];
}

/* ------------------------------------------------------------------ *
 * Canonical vocabulary
 *
 * The LLM writes drug and condition names the way the document writes them
 * ("Depo shot", "medroxyprogesterone acetate", "Depo-Provera 150 mg/mL").
 * Left alone, the profile would list the same exposure five times. Rather
 * than invent a second vocabulary, we canonicalise against the term taxonomy
 * the deterministic matcher already uses — so the two stages agree on what
 * counts as the same drug, and adding a term to terms.json improves both.
 * ------------------------------------------------------------------ */

interface TermDef { key: string; label: string; variants: string[] }
interface CatDef { key: string; label: string; terms: TermDef[] }

const CATEGORIES = (taxonomy as { categories: CatDef[] }).categories;

function termsFor(categoryKey: string): TermDef[] {
  return CATEGORIES.find((c) => c.key === categoryKey)?.terms ?? [];
}

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9./-]+/g, " ").trim();

function canonicalise(raw: string, categoryKeys: string[]): { key: string; label: string } {
  const hay = ` ${normText(raw)} `;
  let best: { key: string; label: string; len: number } | null = null;
  for (const catKey of categoryKeys) {
    for (const term of termsFor(catKey)) {
      for (const v of term.variants) {
        const needle = ` ${normText(v)} `;
        if (hay.includes(needle.trim()) && (!best || v.length > best.len)) {
          best = { key: term.key, label: term.label, len: v.length };
        }
      }
    }
  }
  if (best) return { key: best.key, label: best.label };
  // Not in the taxonomy — keep the document's own wording rather than drop it.
  return { key: `x:${normText(raw)}`, label: raw };
}

export const canonicalDrug = (raw: string) => canonicalise(raw, ["medication"]);
export const canonicalCondition = (raw: string) =>
  canonicalise(raw, ["diagnosis", "procedure"]);

/* ------------------------------------------------------------------ *
 * Value normalisation — used to decide whether two documents actually
 * disagree, or merely phrase the same fact differently. "3/14/91 (as written
 * on intake form)" and "03/14/1991" are the same date; we should not cry
 * conflict over formatting.
 * ------------------------------------------------------------------ */

export function normaliseValue(v: string): string {
  let s = v.toLowerCase().replace(/\([^)]*\)/g, " ");
  s = s.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/g, (_m, mm, dd, yy) => {
    const year = yy.length === 2 ? (Number(yy) > 40 ? `19${yy}` : `20${yy}`) : yy;
    return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${year}`;
  });
  return s.replace(/[^a-z0-9/]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "NKDA — no known drug allergies" and "None" are the same answer. */
const isNoneIsh = (s: string) => /^(none|nkda|negative|never|denies)\b/.test(s) || /no known/.test(s);

/** "Sofia Grant, DO" / "Grant, Sofia DO" / "S. Grant, DO" are one person.
 *  Compare on the sorted set of name tokens, ignoring single-letter initials. */
function nameKey(v: string): string {
  return normaliseValue(v)
    .split(" ")
    .filter((t) => t.length > 1)
    .sort()
    .join(" ");
}

export function valuesAgree(a: string, b: string): boolean {
  const x = normaliseValue(a);
  const y = normaliseValue(b);
  if (x === y || x.includes(y) || y.includes(x)) return true;
  if (isNoneIsh(x) && isNoneIsh(y)) return true;
  const nx = nameKey(a);
  const ny = nameKey(b);
  return nx.length > 0 && (nx === ny || nx.includes(ny) || ny.includes(nx));
}

/** MM/DD/YYYY -> sortable int. Non-dates sort last. */
export function dateKey(d?: string | null): number {
  if (!d) return Number.POSITIVE_INFINITY;
  const m = d.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]);
  const y = d.match(/\b(20\d{2})\b/);
  if (y) return Number(y[1]) * 10000;
  return Number.POSITIVE_INFINITY;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export function recordsJsonPath(doc: DocMeta): string {
  return `/demo/${doc.id}.records.json`;
}

/**
 * Load extracted records for a document. Supabase first (it carries reviewer
 * decisions); static pipeline output as fallback so the demo still renders
 * with the database unreachable — same contract as loadDocFindings.
 */
export async function loadDocRecords(doc: DocMeta): Promise<CaseRecord[]> {
  try {
    const { data, error } = await supabase()
      .from("case_records")
      .select(
        "id,type,page,quote,matched_text,certainty,reported_by,data,grounding,source,page_conf,word_conf,confidence,routing,rects,decision,decided_by"
      )
      .eq("document_id", doc.id)
      .order("id");
    if (error) throw error;
    if (data && data.length > 0) return data as CaseRecord[];
  } catch {
    // fall through to the committed pipeline artifact
  }
  // An ingested document has no committed artifact to fall back to; if the
  // database did not answer, we have nothing, and we say so rather than inventing.
  if (!doc.findingsJson) return [];
  const r = await fetch(recordsJsonPath(doc));
  if (!r.ok) return [];
  const j = (await r.json()) as RecordsFile;
  return (j.records ?? []).map((rec) => ({ ...rec, decision: rec.decision ?? null }));
}

/** Persist a reviewer decision against every record backing one profile field. */
export async function recordProfileDecision(
  recordIds: string[],
  decision: Exclude<Decision, null>,
  detail: string,
  actor = "Ops Reviewer (demo)"
): Promise<boolean> {
  try {
    const sb = supabase();
    const { error } = await sb
      .from("case_records")
      .update({ decision, decided_by: actor, decided_at: new Date().toISOString() })
      .in("id", recordIds);
    if (error) throw error;
    await sb.from("audit_events").insert({
      event: `profile.${decision}`,
      document_id: recordIds[0]?.split(":")[0] ?? null,
      detail,
      actor,
    });
    return true;
  } catch {
    return false;
  }
}
