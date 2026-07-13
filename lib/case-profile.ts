import { DocMeta, Finding, Manifest } from "@/lib/demo";

/** A single provenance-carrying citation back to a source document/page. */
export interface Citation {
  docId: string;
  docTitle: string;
  page: number;
  evidence: string;
  confidence: number;
}

export interface ExposureEntry {
  drug: string;
  variantsSeen: string[];
  firstDateFound: string | null;
  lastDateFound: string | null;
  mentionCount: number;
  citations: Citation[];
}

export interface DiagnosisEntry {
  condition: string;
  categoryLabel: string;
  firstDateFound: string | null;
  negatedElsewhere: boolean;
  mentionCount: number;
  citations: Citation[];
}

export interface CausationEntry {
  quote: string;
  citation: Citation;
}

export interface ProviderEntry {
  facility: string;
  docType: string;
  received: string;
  docId: string;
}

export interface CaseProfile {
  matter: Manifest["matter"];
  generatedAt: string;
  sourceDocuments: { id: string; title: string; pages: number; status: string }[];
  exposures: ExposureEntry[];
  diagnoses: DiagnosisEntry[];
  causation: CausationEntry[];
  providers: ProviderEntry[];
  totals: { documents: number; findings: number; autoAccepted: number; needsReview: number };
}

const DATE_RE = /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(20\d{2})\b/g;
// Dates that describe something other than "when this happened" — refill
// authorization windows, expiration dates, lot/label metadata — are
// excluded so the timeline only reflects clinical/dispensing dates.
const DISQUALIFY_RE = /(refill|exp|expir|by\s*$)/i;

/** Extract the first date in the evidence window that isn't immediately
 *  preceded by disqualifying label context (e.g. "REFILLS: 3 BY 12/17/2023"). */
function extractDate(text: string): string | null {
  DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (!DISQUALIFY_RE.test(before)) return m[0];
  }
  return null;
}

function dateSortKey(d: string | null): number {
  if (!d) return Number.POSITIVE_INFINITY;
  const [mm, dd, yyyy] = d.split("/").map(Number);
  return yyyy * 10000 + mm * 100 + dd;
}

/**
 * Aggregate findings across every document in the matter into a single
 * canonical case profile: exposure history, diagnosis timeline, causation
 * evidence, and the provider/facility list — each entry carrying source
 * citations back to the originating document and page.
 */
export function buildCaseProfile(
  manifest: Manifest,
  allFindings: Map<string, Finding[]>
): CaseProfile {
  const docById = new Map(manifest.documents.map((d) => [d.id, d]));

  const exposureMap = new Map<string, ExposureEntry>();
  const diagnosisMap = new Map<string, DiagnosisEntry>();
  const causation: CausationEntry[] = [];

  let totalFindings = 0;
  let autoAccepted = 0;
  let needsReview = 0;

  for (const [docId, findings] of allFindings) {
    const doc = docById.get(docId);
    if (!doc) continue;

    for (const f of findings) {
      totalFindings++;
      if (f.routing === "auto") autoAccepted++;
      if (f.routing === "review" || f.routing === "escalated") needsReview++;

      const citation: Citation = {
        docId,
        docTitle: doc.title,
        page: f.page,
        evidence: f.evidence,
        confidence: f.confidence,
      };
      const foundDate = extractDate(f.evidence);

      if (f.category === "medication") {
        const key = f.term_label;
        const entry = exposureMap.get(key) ?? {
          drug: f.term_label,
          variantsSeen: [],
          firstDateFound: null,
          lastDateFound: null,
          mentionCount: 0,
          citations: [],
        };
        entry.mentionCount++;
        if (!entry.variantsSeen.includes(f.variant)) entry.variantsSeen.push(f.variant);
        if (foundDate) {
          if (!entry.firstDateFound || dateSortKey(foundDate) < dateSortKey(entry.firstDateFound))
            entry.firstDateFound = foundDate;
          if (!entry.lastDateFound || dateSortKey(foundDate) > dateSortKey(entry.lastDateFound))
            entry.lastDateFound = foundDate;
        }
        if (entry.citations.length < 6) entry.citations.push(citation);
        exposureMap.set(key, entry);
      }

      if (f.category === "diagnosis" && !f.negated) {
        const key = f.term_label;
        const entry = diagnosisMap.get(key) ?? {
          condition: f.term_label,
          categoryLabel: f.category_label,
          firstDateFound: null,
          negatedElsewhere: false,
          mentionCount: 0,
          citations: [],
        };
        entry.mentionCount++;
        if (foundDate && (!entry.firstDateFound || dateSortKey(foundDate) < dateSortKey(entry.firstDateFound))) {
          entry.firstDateFound = foundDate;
        }
        if (entry.citations.length < 6) entry.citations.push(citation);
        diagnosisMap.set(key, entry);
      }
      if (f.category === "diagnosis" && f.negated) {
        const entry = diagnosisMap.get(f.term_label);
        if (entry) entry.negatedElsewhere = true;
      }

      if (f.category === "causation" && !f.negated) {
        causation.push({ quote: f.evidence, citation });
      }
    }
  }

  const providers: ProviderEntry[] = manifest.documents.map((d) => ({
    facility: d.facility,
    docType: d.docType,
    received: d.received,
    docId: d.id,
  }));

  return {
    matter: manifest.matter,
    generatedAt: new Date().toISOString(),
    sourceDocuments: manifest.documents.map((d) => ({
      id: d.id,
      title: d.title,
      pages: d.pages,
      status: d.status,
    })),
    exposures: [...exposureMap.values()].sort((a, b) => b.mentionCount - a.mentionCount),
    diagnoses: [...diagnosisMap.values()].sort(
      (a, b) => dateSortKey(a.firstDateFound) - dateSortKey(b.firstDateFound)
    ),
    causation: causation.slice(0, 12),
    providers,
    totals: {
      documents: manifest.documents.length,
      findings: totalFindings,
      autoAccepted,
      needsReview,
    },
  };
}

export async function loadCaseProfile(
  manifest: Manifest,
  loadDocFindings: (doc: DocMeta) => Promise<Finding[]>
): Promise<CaseProfile> {
  const entries = await Promise.all(
    manifest.documents.map(async (d) => [d.id, await loadDocFindings(d)] as const)
  );
  return buildCaseProfile(manifest, new Map(entries));
}
