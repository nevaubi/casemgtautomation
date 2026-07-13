import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

import type { CaseProfile } from "@/lib/case-profile";

const BRAND = "0F4A74";
const PAGE_W = 12240; // US Letter, DXA
const PAGE_H = 15840;
const MARGIN = 1080; // 0.75"
const CONTENT_W = PAGE_W - 2 * MARGIN;

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 24 })],
  });
}

function meta(text: string) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, italics: true, size: 18, color: "555555" })],
  });
}

function bodyPara(text: string, opts: Partial<{ bold: boolean; italics: boolean; size: number }> = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, ...opts })],
  });
}

function twoColTable(rows: [string, string][]) {
  const colA = Math.round(CONTENT_W * 0.32);
  const colB = CONTENT_W - colA;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [colA, colB],
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: colA, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: "F1F5F8" },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 18 })] })],
            }),
            new TableCell({
              width: { size: colB, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: v, size: 18 })] })],
            }),
          ],
        })
    ),
  });
}

function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DCE2" } },
    spacing: { after: 200 },
    children: [],
  });
}

export async function POST(req: NextRequest) {
  const profile = (await req.json()) as CaseProfile;
  const m = profile.matter;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: "SEEGERWEISS", bold: true, size: 30, color: BRAND })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "DRAFT — PLAINTIFF FACT SHEET (AUTO-COMPILED)", bold: true, size: 20, color: "555555" }),
      ],
    }),
    hr(),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      children: [new TextRun({ text: m.name, bold: true, size: 32 })],
    }),
    meta(
      `${m.litifyMatterNumber} · ${m.team} · Compiled ${new Date(profile.generatedAt).toLocaleDateString()} ` +
        `from ${profile.totals.documents} source document(s), ${profile.totals.findings} extracted findings`
    ),
    bodyPara(m.caption, { italics: true }),

    h2("1. Exposure & medication history"),
    ...profile.exposures.flatMap((e) => [
      bodyPara(e.drug, { bold: true }),
      bodyPara(
        `${e.mentionCount} mention(s) across the record set` +
          (e.firstDateFound
            ? e.firstDateFound === e.lastDateFound
              ? ` · documented ${e.firstDateFound}`
              : ` · ${e.firstDateFound} — ${e.lastDateFound}`
            : " · no explicit date captured")
      ),
      bodyPara(
        `Source: ${e.citations.map((c) => `${c.docTitle} p.${c.page}`).join("; ")}`,
        { size: 16 }
      ),
    ]),

    h2("2. Diagnosis & symptom timeline"),
    ...profile.diagnoses.flatMap((d) => [
      bodyPara(
        `${d.condition}${d.firstDateFound ? ` — first documented ${d.firstDateFound}` : ""}`,
        { bold: true }
      ),
      bodyPara(
        `${d.mentionCount} mention(s)` + (d.negatedElsewhere ? " · also denied at a later visit" : ""),
        { size: 16 }
      ),
      bodyPara(`Source: ${d.citations.map((c) => `${c.docTitle} p.${c.page}`).join("; ")}`, { size: 16 }),
    ]),

    h2("3. Causation language"),
    ...(profile.causation.length === 0
      ? [bodyPara("No causation language identified in this document set.", { italics: true })]
      : profile.causation.flatMap((c) => [
          bodyPara(`"${c.quote}"`, { italics: true }),
          bodyPara(
            `— ${c.citation.docTitle}, p.${c.citation.page} (${(c.citation.confidence * 100).toFixed(0)}% confidence)`,
            { size: 16 }
          ),
        ])),

    h2("4. Providers, facilities & source documents"),
    twoColTable(profile.providers.map((p) => [p.facility, `${p.docType} · received ${p.received}`])),

    new Paragraph({ spacing: { before: 300 }, children: [] }),
    meta(
      "This fact sheet was auto-compiled from AI-extracted findings and has not been reviewed by counsel. " +
        "Verify every field and citation against the source documents before filing or production."
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Plaintiff-Fact-Sheet-Draft-${m.litifyMatterNumber}.docx"`,
    },
  });
}
