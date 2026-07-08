import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import manifest from "@/public/demo/manifest.json";

export const maxDuration = 120;

/**
 * Idempotent sync of the Payload collections from the pipeline's demo
 * output. Guarded by the PAYLOAD_SECRET. Safe to call repeatedly: the
 * matter is created once (matched by sfId) and each document is matched
 * by its slugId — existing documents are skipped, missing ones are
 * created along with their findings and audit events.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-token") !== process.env.PAYLOAD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await getPayload({ config });

  // Matter: create once, reuse thereafter.
  const m = manifest.matter;
  const matterQuery = await payload.find({
    collection: "matters",
    where: { sfId: { equals: m.id } },
    limit: 1,
  });
  const matter =
    matterQuery.docs[0] ??
    (await payload.create({
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
    }));
  const matterCreated = matterQuery.docs.length === 0;

  const base = new URL(req.url).origin;
  let documentsCreated = 0;
  let documentsSkipped = 0;
  let findingsCreated = 0;

  for (const d of manifest.documents) {
    const existingDoc = await payload.find({
      collection: "case-documents",
      where: { slugId: { equals: d.id } },
      limit: 1,
    });
    if (existingDoc.docs.length > 0) {
      documentsSkipped++;
      continue;
    }

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
    documentsCreated++;

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
      findingsCreated++;
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
    synced: true,
    matterCreated,
    documentsCreated,
    documentsSkipped,
    findingsCreated,
  });
}
