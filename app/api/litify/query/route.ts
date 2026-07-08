import { NextRequest, NextResponse } from "next/server";
import manifest from "@/public/demo/manifest.json";

/**
 * Mock Salesforce SOQL endpoint (subset), byte-shape-compatible with
 * GET /services/data/v60.0/query?q=...  responses:
 *   { totalSize, done, records: [{ attributes: { type, url }, ...fields }] }
 * Supports the two queries the real connector issues:
 *   - ContentDocumentLink by LinkedEntityId
 *   - ContentVersion by ContentDocumentId (IsLatest)
 */
export function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
  const docs = manifest.documents;

  if (q.includes("from contentdocumentlink")) {
    const records = docs.map((d) => ({
      attributes: {
        type: "ContentDocumentLink",
        url: `/services/data/v60.0/sobjects/ContentDocumentLink/06A1U0000${d.id.slice(-8)}`,
      },
      ContentDocumentId: d.sfContentDocumentId,
      LinkedEntityId: manifest.matter.id,
      ShareType: "V",
    }));
    return NextResponse.json({ totalSize: records.length, done: true, records });
  }

  if (q.includes("from contentversion")) {
    const wanted = docs.filter((d) => q.includes(d.sfContentDocumentId.toLowerCase()));
    const list = wanted.length ? wanted : docs;
    const records = list.map((d) => ({
      attributes: {
        type: "ContentVersion",
        url: `/services/data/v60.0/sobjects/ContentVersion/${d.sfContentVersionId}`,
      },
      Id: d.sfContentVersionId,
      ContentDocumentId: d.sfContentDocumentId,
      Title: d.title,
      FileExtension: "pdf",
      IsLatest: true,
      VersionData: `/api/litify/version/${d.sfContentVersionId}/data`,
    }));
    return NextResponse.json({ totalSize: records.length, done: true, records });
  }

  return NextResponse.json(
    [{ message: `Unsupported mock SOQL: ${q.slice(0, 120)}`, errorCode: "MALFORMED_QUERY" }],
    { status: 400 },
  );
}
