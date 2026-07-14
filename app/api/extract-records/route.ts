import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import spec from "@/pipeline/casepipe/record_spec.json";
import { ExtractionPage, groundRecords, RawRecord } from "@/lib/record-grounding";

/**
 * Live record extraction for a document the user just dropped on /upload.
 *
 * The PDF never leaves the browser. The client has already rasterised, read the
 * text layer or run OCR, and matched terms locally; it sends only the page word
 * stream. This route turns that text into structured records with one Sonnet
 * call, then grounds every record it gets back against the same word stream
 * before returning anything — identical rules to the batch pipeline, because
 * both read pipeline/casepipe/record_spec.json.
 */

// Vercel's fluid-compute ceiling (300s on Hobby, 800s on Pro). Extraction is a
// single Sonnet call, but on a long scanned chart it runs with adaptive thinking
// over 30+ pages of OCR text, which does not fit in the 60s default.
export const maxDuration = 300;

interface Body {
  documentId: string;
  filename?: string;
  pages: ExtractionPage[];
}

/** The model sees page-tagged text and nothing else — never the PDF, never the
 *  image. It cannot "read" anything the OCR failed to produce. */
function documentText(pages: ExtractionPage[]): string {
  return pages
    .map((p) => {
      const text = p.words.map((w) => w.text).join(" ");
      return (
        `<page number="${p.number}" source="${p.source}" ` +
        `ocr_confidence="${p.mean_conf.toFixed(2)}">\n${text}\n</page>`
      );
    })
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this deployment." },
      { status: 501 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
    if (!body?.pages?.length || !body.documentId) throw new Error("bad shape");
  } catch {
    return NextResponse.json({ error: "Expected { documentId, pages[] }" }, { status: 400 });
  }

  const client = new Anthropic();
  const tool = spec.tool;

  let raw: RawRecord[] = [];
  try {
    // Sonnet 5 rejects sampling parameters (temperature/top_p/top_k) with a 400,
    // and runs adaptive thinking by default — which counts against max_tokens.
    // The spec's budget covers thinking plus the tool call, and sets effort
    // explicitly instead of inheriting the "high" default.
    const msg = await client.messages.create({
      model: spec.model,
      max_tokens: spec.max_tokens,
      output_config: { effort: spec.effort as "low" | "medium" | "high" },
      system: spec.system_prompt,
      tools: [tool as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content:
            `Document: ${body.filename ?? body.documentId}\n` +
            `Pages with source="ocr" were scanned; their text is degraded and you must quote it ` +
            `exactly as garbled. Extract every structured record.\n\n${documentText(body.pages)}`,
        },
      ],
    });
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.name === tool.name) {
        raw = ((block.input as { records?: RawRecord[] }).records ?? []) as RawRecord[];
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Extraction failed: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const { records, rejected } = groundRecords(body.documentId, body.pages, raw);

  return NextResponse.json({
    document_id: body.documentId,
    model: spec.model,
    spec_version: spec.meta.version,
    counts: {
      proposed: raw.length,
      grounded: records.length,
      // Records the model asserted that the page does not support. Surfaced,
      // not swallowed: this is the hallucination rate, and it belongs on screen.
      rejected: rejected.length,
      auto: records.filter((r) => r.routing === "auto").length,
      review: records.filter((r) => r.routing === "review").length,
      escalated: records.filter((r) => r.routing === "escalated").length,
    },
    records,
    rejected,
  });
}
