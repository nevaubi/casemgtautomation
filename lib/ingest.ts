import { supabase } from "@/lib/supabase";
import { CaseRecord } from "@/lib/records";
import { DocMeta, logAuditEvent, Manifest } from "@/lib/demo";

/**
 * Closing the loop.
 *
 * Until now a PDF dropped on Upload & Process was extracted, displayed, and then
 * forgotten. The settlement grid could never move, because the records never
 * joined the case file. This writes them in: the document row, its records, and
 * an audit event — after which every downstream surface (profile, grid, score
 * history) simply sees a seventh document and recomputes. Nothing else has to
 * know that an ingest happened, because the score is a pure function of the
 * record set.
 */

export interface IngestInput {
  matterId: string;
  documentId: string;
  title: string;
  facility: string;
  pages: number;
  ocrPages: number;
  meanOcrConf: number;
  records: CaseRecord[];
}

export interface IngestResult {
  ok: boolean;
  documentId: string;
  records: number;
  error?: string;
}

/** Filename -> a stable, readable document id. */
export function slugFor(filename: string): string {
  const base = filename.replace(/\.pdf$/i, "").toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `upload_${slug || "document"}_${Date.now().toString(36)}`;
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const sb = supabase();
  const counts = {
    total: input.records.length,
    auto: input.records.filter((r) => r.routing === "auto").length,
    review: input.records.filter((r) => r.routing === "review").length,
    escalated: input.records.filter((r) => r.routing === "escalated").length,
    negated: 0,
  };

  const { error: docErr } = await sb.from("documents").insert({
    id: input.documentId,
    matter_id: input.matterId,
    title: input.title,
    facility: input.facility,
    doc_type: "Medical Records (uploaded)",
    received: new Date().toISOString().slice(0, 10),
    pages: input.pages,
    ocr_pages: input.ocrPages,
    mean_ocr_conf: input.meanOcrConf,
    status: counts.review + counts.escalated > 0 ? "Needs Review" : "Auto-Processed",
    counts,
  });
  if (docErr) return { ok: false, documentId: input.documentId, records: 0, error: docErr.message };

  const rows = input.records.map((r, i) => ({
    // Re-key against the real document id: the extraction route used a placeholder.
    id: `${input.documentId}:${i}`,
    document_id: input.documentId,
    type: r.type,
    page: r.page,
    quote: r.quote,
    matched_text: r.matched_text,
    certainty: r.certainty,
    reported_by: r.reported_by,
    data: r.data,
    grounding: r.grounding,
    source: r.source,
    page_conf: r.page_conf,
    word_conf: r.word_conf,
    confidence: r.confidence,
    routing: r.routing,
    rects: r.rects,
  }));

  if (rows.length > 0) {
    const { error: recErr } = await sb.from("case_records").insert(rows);
    if (recErr) {
      return { ok: false, documentId: input.documentId, records: 0, error: recErr.message };
    }
  }

  await logAuditEvent(
    "ingest.document",
    input.documentId,
    `Ingested ${input.title} — ${input.pages} page(s), ${counts.total} grounded records ` +
      `(${counts.auto} auto / ${counts.review} review / ${counts.escalated} escalated). ` +
      `Case profile and settlement grid recomputed.`
  );

  return { ok: true, documentId: input.documentId, records: rows.length };
}

/**
 * The manifest is the six seeded documents. Anything ingested since lives only in
 * the database — so the app's view of the case file is the union of the two. Every
 * page that calls getManifest() picks up ingested documents for free.
 */
export async function withIngestedDocuments(manifest: Manifest): Promise<Manifest> {
  try {
    const known = new Set(manifest.documents.map((d) => d.id));
    const { data, error } = await supabase()
      .from("documents")
      .select("id,title,facility,doc_type,received,pages,ocr_pages,mean_ocr_conf,status,counts")
      .order("received");
    if (error || !data) return manifest;

    const extra: DocMeta[] = data
      .filter((d) => !known.has(d.id as string))
      .map((d) => ({
        id: d.id as string,
        title: (d.title as string) ?? "Uploaded document",
        facility: (d.facility as string) ?? "Uploaded",
        docType: (d.doc_type as string) ?? "Medical Records (uploaded)",
        received: (d.received as string) ?? new Date().toISOString().slice(0, 10),
        sfContentDocumentId: "",
        sfContentVersionId: "",
        pages: (d.pages as number) ?? 0,
        ocrPages: (d.ocr_pages as number) ?? 0,
        meanOcrConf: Number(d.mean_ocr_conf ?? 0.99),
        counts: (d.counts as DocMeta["counts"]) ?? {
          total: 0, auto: 0, review: 0, escalated: 0, negated: 0,
        },
        processingSeconds: 0,
        enrichedPdf: "",
        findingsJson: "",
        status: (d.status as DocMeta["status"]) ?? "Auto-Processed",
      }));

    if (extra.length === 0) return manifest;
    return { ...manifest, documents: [...manifest.documents, ...extra] };
  } catch {
    return manifest;
  }
}
