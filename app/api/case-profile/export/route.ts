import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

import type { CaseProfile, Citation } from "@/lib/case-profile";

/**
 * Draft Plaintiff Fact Sheet.
 *
 * This is the artifact that actually gets filed, so it is the one place the
 * app is most careful:
 *   - every row carries its source document and page;
 *   - anything a reviewer rejected never arrives here (see forExport);
 *   - fields the model was not confident about, and fields where two documents
 *     disagree, are collected into a verification appendix at the end rather
 *     than being quietly smoothed over.
 */

const BRAND = "0F4A74";
const PAGE_W = 12240; // US Letter, DXA
const PAGE_H = 15840;
const MARGIN = 1080; // 0.75"
const CONTENT_W = PAGE_W - 2 * MARGIN;

const src = (cs: Citation[]) =>
  cs.map((c) => `${c.docTitle} p.${c.page} (${Math.round(c.confidence * 100)}%)`).join("; ");

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 24 })],
  });
}

function body(text: string, opts: Partial<{ bold: boolean; italics: boolean; size: number; color: string }> = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, ...opts })],
  });
}

function note(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 16, italics: true, color: "666666" })],
  });
}

function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DCE2" } },
    spacing: { after: 200 },
    children: [],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; width: number; size?: number }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 17 })],
      }),
    ],
  });
}

/** Table with a brand-tinted header row and proportional columns. */
function table(headers: string[], rows: string[][], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((CONTENT_W * w) / total));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          cell(h, { bold: true, fill: "E7EDF2", width: widths[i], size: 16 })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((v, i) => cell(v, { width: widths[i] })),
          })
      ),
    ],
  });
}

export async function POST(req: NextRequest) {
  let profile: CaseProfile;
  try {
    profile = (await req.json()) as CaseProfile;
    if (!profile?.matter?.litifyMatterNumber || !Array.isArray(profile.exposures)) {
      throw new Error("bad shape");
    }
  } catch {
    return NextResponse.json({ error: "Invalid case profile payload" }, { status: 400 });
  }

  const m = profile.matter;
  const t = profile.totals;
  const dash = "—";

  /* Everything a human still has to check, gathered in one place. */
  const openItems: string[][] = [];
  const push = (section: string, e: { conflicts: { label: string; values: { value: string; docTitle: string; page: number }[] }[]; routing: string; decision: string | null }, label: string) => {
    for (const c of e.conflicts) {
      openItems.push([
        section,
        label,
        `${c.label}: ${c.values.map((v) => `"${v.value}" (${v.docTitle} p.${v.page})`).join(" vs ")}`,
      ]);
    }
    if (e.routing !== "auto" && !e.decision) {
      openItems.push([section, label, `Low-confidence extraction (${e.routing}) — verify against source.`]);
    }
  };
  profile.demographics.forEach((d) => push("Identity", d, d.field));
  profile.exposures.forEach((e) => push("Exposure", e, e.drug));
  profile.administrations.forEach((a) => push("Administration", a, `${a.drug} ${a.date}`));
  profile.diagnoses.forEach((d) => push("Diagnosis", d, d.condition));
  profile.causation.forEach((c) => push("Causation", c, c.author ?? "statement"));
  profile.treatments.forEach((x) => push("Treatment", x, x.intervention));

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
          text: "DRAFT — PLAINTIFF FACT SHEET (AUTO-COMPILED, NOT REVIEWED BY COUNSEL)",
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
    body(`${m.litifyMatterNumber} · ${m.team} · ${m.attorney}`, { size: 18 }),
    note(
      `Compiled ${new Date(profile.generatedAt).toLocaleString()} from ${t.documents} source ` +
        `document(s). ${t.records} structured records extracted by ${profile.model}, each grounded ` +
        `in a verbatim quote located on the cited page. ${t.auto} auto-accepted, ${t.review} flagged ` +
        `for review, ${t.escalated} escalated, ${t.rejected} rejected by a reviewer and excluded ` +
        `from this draft. ${openItems.length} item(s) still require human verification — see the ` +
        `final section.`
    ),

    h2("1. Plaintiff identity & history"),
    table(
      ["Field", "Value", "Source"],
      profile.demographics.map((d) => [d.field, d.value || dash, src(d.citations)]),
      [22, 40, 38]
    ),

    h2("2. Exposure & medication history"),
    ...profile.exposures.flatMap((e) => [
      body(e.drug, { bold: true }),
      table(
        ["Field", "As documented"],
        [
          ["Dose", e.doses.join(" / ") || dash],
          ["Route", e.routes.join(" / ") || dash],
          ["Regimen", e.regimens.join(" / ") || dash],
          ["Prescriber", e.prescribers.join(" / ") || dash],
          ["NDC", e.ndc ?? dash],
          [
            "Documented use",
            e.administrationCount > 0
              ? `${e.administrationCount} administration(s), ${e.firstAdministered} to ${e.lastAdministered}`
              : e.firstDocumented
                ? `First documented ${e.firstDocumented}`
                : "No start date stated",
          ],
          ["Pharmacy fills", e.fills.length ? e.fills.join(", ") : dash],
          ["Discontinued", e.discontinued ?? dash],
          ["Source", src(e.citations)],
        ],
        [22, 78]
      ),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ]),

    h2("3. Administration log"),
    table(
      ["Date", "Drug", "Dose / route", "Site", "Lot", "Administered by", "Source"],
      profile.administrations.map((a) => [
        a.date || dash,
        a.drug,
        [a.dose, a.route].filter(Boolean).join(" ") || dash,
        a.site ?? dash,
        a.lot ?? dash,
        a.administeredBy ?? dash,
        src(a.citations),
      ]),
      [12, 22, 14, 10, 8, 14, 20]
    ),

    h2("4. Diagnosis timeline"),
    table(
      ["First documented", "Condition", "ICD-10", "Diagnosed by", "Confirming test", "Source"],
      profile.diagnoses.map((d) => [
        d.firstDocumented ?? dash,
        d.condition,
        d.icd10 ?? dash,
        d.diagnosedBy ?? dash,
        d.confirmingTest ?? dash,
        src(d.citations),
      ]),
      [12, 22, 8, 16, 22, 20]
    ),

    h2("5. Causation evidence"),
    ...(profile.causation.length === 0
      ? [body("No clinician causation statement identified in this document set.", { italics: true })]
      : profile.causation.flatMap((c) => [
          body(`"${c.statement}"`, { italics: true }),
          body(
            `— ${c.author ?? "unattributed"}${c.date ? `, ${c.date}` : ""}` +
              `${c.relationship ? ` · characterised as: ${c.relationship}` : ""}`,
            { size: 16 }
          ),
          body(`Source: ${src(c.citations)}`, { size: 16, color: "666666" }),
        ])),

    h2("6. Treatment & diagnostics"),
    table(
      ["Date", "Intervention", "Result", "CPT", "Source"],
      profile.treatments.map((x) => [
        x.date ?? dash,
        x.intervention,
        x.result ?? dash,
        x.cpt ?? dash,
        src(x.citations),
      ]),
      [11, 24, 33, 7, 25]
    ),

    h2("7. Providers & facilities"),
    table(
      ["Name", "Specialty", "Role in this case", "Source"],
      profile.providers.map((p) => [
        [p.name, p.credential].filter(Boolean).join(", "),
        p.specialty ?? dash,
        p.role ?? dash,
        src(p.citations),
      ]),
      [22, 18, 36, 24]
    ),

    h2("8. Denied & ruled out"),
    note(
      "Negative findings are reproduced here because opposing counsel will rely on them. " +
        "The extraction stage is instructed never to convert a denial into a diagnosis."
    ),
    table(
      ["Condition", "Date", "As documented", "Source"],
      profile.ruledOut.map((r) => [r.condition, r.date ?? dash, r.note ?? dash, src(r.citations)]),
      [24, 12, 40, 24]
    ),

    h2("9. Verification required before filing"),
    ...(openItems.length === 0
      ? [body("Every field was extracted at high confidence and no source conflicts remain.", { italics: true })]
      : [
          note(
            "The tool will not resolve these on its own. Each item below is either a low-confidence " +
              "extraction or a genuine disagreement between two source documents."
          ),
          table(
            ["Section", "Field", "What needs checking"],
            openItems,
            [16, 26, 58]
          ),
        ]),

    new Paragraph({ spacing: { before: 300 }, children: [] }),
    note(
      "This fact sheet was auto-compiled from AI-extracted records and has NOT been reviewed by " +
        "counsel. Every field carries a citation to its source document and page — verify each one " +
        "against the underlying record before filing or production."
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
      "Content-Disposition": `attachment; filename="Plaintiff-Fact-Sheet-Draft-${m.litifyMatterNumber}.docx"`,
    },
  });
}
