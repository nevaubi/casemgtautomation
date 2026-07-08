import { NextRequest, NextResponse } from "next/server";
import manifest from "@/public/demo/manifest.json";

/**
 * Mock of GET /sobjects/ContentVersion/{id}/VersionData — the binary
 * download endpoint. Redirects to the static fixture, mirroring how the
 * real connector treats the response as an opaque byte stream.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const doc = manifest.documents.find((d) => d.sfContentVersionId === id);
  if (!doc) {
    return NextResponse.json(
      [{ message: "The requested resource does not exist", errorCode: "NOT_FOUND" }],
      { status: 404 },
    );
  }
  // Original source fixture (pre-enrichment), as Litify would serve it.
  return NextResponse.redirect(
    new URL(`/records/${doc.id}.pdf`, _req.nextUrl.origin), 302,
  );
}
