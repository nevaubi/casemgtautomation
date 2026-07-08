import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import manifest from "@/public/demo/manifest.json";

export const maxDuration = 120;

/**
 * One-time idempotent seed of the Payload collections from the pipeline's
 * demo output. Guarded by the PAYLOAD_SECRET; no-ops when data exists.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-token") !== process.env.PAYLOAD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await getPayload({ config });

  const existing = await payload.count({ collection: "matters" });
  if (existing.totalDocs > 0) {
    return NextResponse.json({ seeded: false, reason: "data already present" });
  }

  const m = manifest.matter;
  const matter = await payload.create({
    collection: "matters",
    data: {
      name: m.name,
      caption: m.caption,
      matterNumber: m.litifyMatterNumber,
      sfId: m.id,
      team: m.team,
      attorney: m.attorney,
      status: "Records Review",
    },
  });

  let findingsCount = 0;
  for (const d of manifest.documents) {
    const doc = await payload.create({
      collection: "case-documents",
      data: {
        title: d.title,
        matter: matter.id,
        docType: d.docType,
        facility: d.facility,
        received: d.received,
        pages: d.pages,
        ocrPages: d.ocrPages,
        meanOcrConf: d.meanOcrConf,
        processingSeconds: d.processingSeconds,
        status: d.status as "Auto-Processed" | "Needs Review",
        enrichedPdfUrl: d.enrichedPdf,
        slugId: d.id,
        sfContentDocumentId: d.sfContentDocumentId,
        sfContentVersionId: d.sfContentVersionId,
      },
    });

    const base = new URL(req.url).origin;
    const res = await fetch(`${base}${d.findingsJson}`);
    const data = await res.json();
    for (let i = 0; i < data.findings.length; i++) {
      const f = data.findings[i];
      await payload.create({
        collection: "findings",
        data: {
          document: doc.id,
          idx: i,
          termLabel: f.term_label,
          categoryLabel: f.category_label,
          variant: f.variant,
          page: f.page,
          confidence: f.confidence,
          matchQuality: f.match_quality,
          ocrConf: f.ocr_conf,
          routing: f.routing,
          source: f.source,
          negated: f.negated,
          evidence: f.evidence,
        },
      });
      findingsCount++;
    }

    await payload.create({
      collection: "audit-events",
      data: {
        event: "litify.pull",
        detail: `ContentVersion ${d.sfContentVersionId} downloaded (simulated)`,
        actor: "litify-connector",
        documentSlug: d.id,
      },
    });
    await payload.create({
      collection: "audit-events",
      data: {
        event: "pipeline.completed",
        detail: `${d.counts.total} findings in ${d.processingSeconds}s, mean OCR conf ${d.meanOcrConf}`,
        actor: "pipeline v0.1.0",
        documentSlug: d.id,
      },
    });
  }

  return NextResponse.json({
    seeded: true,
    matters: 1,
    documents: manifest.documents.length,
    findings: findingsCount,
  });
}
