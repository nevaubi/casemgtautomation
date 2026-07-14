import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

import type { Citation } from "@/lib/case-profile";
import type { FragilityResult, Scorecard, TimelineStep } from "@/lib/matrix";
import type { Manifest } from "@/lib/demo";

/**
 * Matrix Position Statement.
 *
 * The document a firm would put in front of a claims administrator, a special
 * master, or their own intake committee. Its whole value is that it shows its
 * work: every point names the record, page, and confidence it was derived from,
 * every unresolved factor says so plainly, and the engine version is stamped on
 * the front so the result can be reproduced.
 */

const BRAND = "0F4A74";
const PAGE_W = 12240;
const PAGE_H = 15840;
const MARGIN = 1080;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const dash = "—";

const src = (cs: Citation[]) =>
  cs.length
    ? cs.map((c) => `${c.docTitle} p.${c.page} (${Math.round(c.confidence * 100)}%)`).join("; ")
    : "No citable record";

const h2 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 24 })],
  });

const body = (text: string, o: Partial<{ bold: boolean; italics: boolean; size: number; color: string }> = {}) =>
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, size: 20, ...o })] });

const note = (text: string) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 16, italics: true, color: "666666" })],
  });

const hr = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DCE2" } },
    spacing: { after: 200 },
    children: [],
  });

function cell(text: string, w: number, opts: { bold?: boolean; fill?: string } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: opts.bold ? 16 : 17 })] })],
  });
}

function table(headers: string[], rows: string[][], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  const w = weights.map((x) => Math.round((CONTENT_W * x) / total));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, w[i], { bold: true, fill: "E7EDF2" })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, w[i])) })),
    ],
  });
}

const STATUS_LABEL: Record<string, string> = {
  met: "MET",
  partial: "PARTIAL",
  clear: "CLEAR",
  not_met: "NOT MET",
  adverse: "ADVERSE",
  indeterminate: "INDETERMINATE",
  withheld: "WITHHELD — UNVERIFIED",
};

interface Body {
  scorecard: Scorecard;
  matter: Manifest["matter"];
  timeline: TimelineStep[];
  fragility?: FragilityResult[];
}

export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
    if (!b?.scorecard?.factors || !b.matter) throw new Error("bad shape");
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const c = b.scorecard;
  const m = b.matter;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: "SEEGERWEISS", bold: true, size: 30, color: BRAND })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "MATRIX POSITION STATEMENT — DRAFT, NOT REVIEWED BY COUNSEL",
          bold: true, size: 20, color: "555555",
        }),
      ],
    }),
    hr(),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      children: [new TextRun({ text: m.name, bold: true, size: 32 })],
    }),
    body(m.caption, { italics: true }),
    body(`${m.litifyMatterNumber} · ${m.team}`, { size: 18 }),

    h2("Position"),
    table(
      ["", "Points", "Tier"],
      [
        ["Matrix position, on the records in hand", String(c.points), c.tier.label],
        [
          "Evidence-adjusted — what the file actually proves",
          String(c.adjustedPoints),
          c.adjustedTier.label,
        ],
        ["Ceiling, if every open factor resolves favourably", String(c.ceiling), c.ceilingTier.label],
        ["Floor, if every open factor resolves against", String(c.floor), ""],
      ],
      [58, 16, 26]
    ),
    ...(c.adjustedTier.key !== c.tier.key
      ? [
          note(
            `The matrix scores this case at ${c.tier.label}. The evidence supports ` +
              `${c.adjustedTier.label}. The ${Math.round((c.points - c.adjustedPoints) * 10) / 10}-point ` +
              `gap is where the file is thin — facts resting on a single document, second-hand reports, ` +
              `and values two documents disagree about. Closing it is corroboration work, not collection work.`
          ),
        ]
      : []),
    note(
      `Scored by a deterministic rules engine against ${c.matrixName} v${c.matrixVersion} from ` +
        `${c.records} structured records extracted across ${c.documents} source document(s). ` +
        `The engine is a pure function: the same records and the same matrix version always produce ` +
        `these points. No language model participates in scoring.`
    ),
    note(c.disclaimer),

    h2("1. Eligibility gates"),
    table(
      ["Gate", "Result", "Basis", "Source"],
      c.gates.map((g) => [g.label, g.passed ? "PASS" : "FAIL", g.finding, src(g.citations)]),
      [22, 8, 42, 28]
    ),

    h2("2. Scored factors"),
    table(
      ["Factor", "Status", "Pts", "Adj.", "Evidence", "Basis", "Source"],
      c.factors.map((f) => [
        f.label,
        STATUS_LABEL[f.status] ?? f.status,
        f.points > 0 ? `+${f.points}` : String(f.points),
        f.points > 0 ? String(f.adjustedPoints) : dash,
        f.points !== 0 ? `${Math.round(f.strength.overall * 100)}% — ${f.strength.note}` : dash,
        f.finding,
        src(f.citations),
      ]),
      [15, 10, 5, 5, 22, 26, 17]
    ),

    h2("3. Unresolved factors and the evidence that would close them"),
    ...(c.openItems.length === 0
      ? [body("Every factor is resolved on the records in hand.", { italics: true })]
      : [
          note(
            "Ranked by the points at stake, not by ease of collection. An unresolved factor is not a " +
              "failure of the analysis — it is a specific, addressable gap in the file."
          ),
          table(
            ["#", "Factor", "Points at stake", "What is missing", "Why it cannot be answered now"],
            c.openItems.map((f, i) => [
              String(i + 1),
              f.label,
              `up to ${f.swing}`,
              f.evidenceNeeded ?? dash,
              f.finding,
            ]),
            [4, 18, 12, 32, 34]
          ),
        ]),

    h2("4. Fragility — what breaks this case"),
    note(
      "Each scoring factor was struck from the file and the case fully re-scored. These are the " +
        "records the defence will attack first, and they are listed here so that the answer is " +
        "prepared before the question is asked."
    ),
    ...(b.fragility && b.fragility.length > 0
      ? [
          table(
            ["Factor", "Points at risk", "Score if struck", "Tier if struck", "Rests on"],
            b.fragility.map((f) => [
              f.label,
              `-${f.pointsAtRisk}`,
              String(f.scoreIfStruck),
              f.dropsATier ? `${f.tierIfStruck}  ← DROPS A TIER` : f.tierIfStruck,
              f.singleSource ? `ONE DOCUMENT: ${f.documents[0]}` : f.documents.join("; "),
            ]),
            [22, 10, 10, 18, 40]
          ),
        ]
      : [body("Fragility analysis not supplied.", { italics: true })]),

    h2("5. How the position was built, document by document"),
    note(
      "Because the score is a pure function of the record set, it can be replayed over the documents " +
        "in the order they were received. This is the same engine run against progressively larger " +
        "subsets of the same records — not a reconstruction."
    ),
    table(
      ["Received", "Document", "Δ", "Running total", "Tier", "What it changed"],
      b.timeline.map((s) => [
        s.received,
        s.facility,
        s.pointsDelta > 0 ? `+${s.pointsDelta}` : String(s.pointsDelta),
        String(s.points),
        s.tier.label,
        s.changes
          .filter((x) => x.delta !== 0)
          .map((x) => `${x.label} ${x.delta > 0 ? "+" : ""}${x.delta}`)
          .join("; ") || "Nothing scoreable",
      ]),
      [11, 22, 6, 10, 12, 39]
    ),

    new Paragraph({ spacing: { before: 300 }, children: [] }),
    note(
      "This position statement was generated from AI-extracted records and a rules engine. It has NOT " +
        "been reviewed by counsel. Every factor cites the source document and page it was derived from; " +
        "verify each against the underlying record before relying on this for any allocation, " +
        "negotiation, or filing decision."
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Matrix-Position-${m.litifyMatterNumber}.docx"`,
    },
  });
}
