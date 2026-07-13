import { supabase } from "./supabase";

export type Routing = "auto" | "review" | "escalated" | "negated";
export type Decision = "approved" | "rejected" | "corrected" | "escalated" | null;

export interface Finding {
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
  rects: number[][];
  confidence: number;
  routing: Routing;
  decision: Decision;
  decided_by?: string | null;
}

export interface PageInfo {
  number: number;
  source: "text_layer" | "ocr";
  mean_conf: number;
  words: number;
}

export interface DocMeta {
  id: string;
  title: string;
  facility: string;
  docType: string;
  received: string;
  sfContentDocumentId: string;
  sfContentVersionId: string;
  pages: number;
  ocrPages: number;
  meanOcrConf: number;
  counts: { total: number; auto: number; review: number; escalated: number; negated: number };
  processingSeconds: number;
  enrichedPdf: string;
  findingsJson: string;
  /** Structured records from the LLM extraction stage (see lib/records.ts). */
  recordsJson?: string;
  recordCounts?: { total: number; auto: number; review: number; escalated: number; rejected: number };
  status: "Auto-Processed" | "Needs Review";
}

export interface Manifest {
  matter: {
    id: string;
    name: string;
    caption: string;
    litifyMatterNumber: string;
    team: string;
    attorney: string;
    status: string;
  };
  documents: DocMeta[];
  generatedAt: string;
  pipelineVersion: string;
  extraction?: {
    model: string;
    specVersion: number;
    stage: string;
    totals: { records: number; auto: number; review: number; escalated: number; rejected: number };
  };
}

export interface AuditEvent {
  id: number;
  event: string;
  document_id: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export async function getManifest(): Promise<Manifest> {
  const r = await fetch("/demo/manifest.json");
  return r.json();
}

/**
 * Load findings for a document. Primary source: Supabase findings store
 * (carries persisted review decisions). Fallback: the static pipeline
 * output JSON, so the demo still renders if the database is unreachable.
 */
export async function loadDocFindings(doc: DocMeta): Promise<Finding[]> {
  try {
    const { data, error } = await supabase()
      .from("findings")
      .select(
        "idx,category,category_label,term_key,term_label,variant,page,match_quality,ocr_conf,source,negated,evidence,rects,confidence,routing,decision,decided_by"
      )
      .eq("document_id", doc.id)
      .order("idx");
    if (error) throw error;
    if (data && data.length > 0) return data as Finding[];
  } catch {
    // fall through to static fixture
  }
  const r = await fetch(doc.findingsJson);
  const j = await r.json();
  return (j.findings as Omit<Finding, "idx" | "decision">[]).map((f, i) => ({
    ...f,
    idx: i,
    decision: null,
  }));
}

/** Persist a review decision and log the audit event. */
export async function recordDecision(
  docId: string,
  idx: number,
  decision: Exclude<Decision, null>,
  actor = "Ops Reviewer (demo)"
): Promise<boolean> {
  try {
    const sb = supabase();
    const { error } = await sb
      .from("findings")
      .update({ decision, decided_by: actor, decided_at: new Date().toISOString() })
      .eq("document_id", docId)
      .eq("idx", idx);
    if (error) throw error;
    await sb.from("audit_events").insert({
      event: `review.${decision}`,
      document_id: docId,
      detail: `Finding #${idx} marked ${decision}`,
      actor,
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadAuditEvents(limit = 25): Promise<AuditEvent[]> {
  try {
    const { data, error } = await supabase()
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AuditEvent[];
  } catch {
    return [];
  }
}

export async function logAuditEvent(
  event: string,
  documentId: string | null,
  detail: string,
  actor = "Ops Reviewer (demo)"
): Promise<void> {
  try {
    await supabase().from("audit_events").insert({
      event,
      document_id: documentId,
      detail,
      actor,
    });
  } catch {
    // audit logging is best-effort in the demo
  }
}

export const routingLabel: Record<Routing, string> = {
  auto: "Auto-Accepted",
  review: "Needs Review",
  escalated: "Escalated",
  negated: "Negated",
};

export const routingColor: Record<Routing, string> = {
  auto: "var(--sw-auto)",
  review: "var(--sw-review)",
  escalated: "var(--sw-escalated)",
  negated: "var(--sw-negated)",
};

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
