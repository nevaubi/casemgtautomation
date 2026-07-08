export type Routing = "auto" | "review" | "escalated" | "negated";

export interface Finding {
  category: string;
  category_label: string;
  term_key: string;
  term_label: string;
  variant: string;
  page: number;
  match_quality: number;
  ocr_conf: number;
  source: "text_layer" | "ocr";
  negated: boolean;
  evidence: string;
  rects: number[][];
  confidence: number;
  routing: Routing;
}

export interface PageInfo {
  number: number;
  source: "text_layer" | "ocr";
  mean_conf: number;
  words: number;
}

export interface DocFindings {
  source_pdf: string;
  enriched_pdf: string;
  pages: PageInfo[];
  counts: { total: number; auto: number; review: number; escalated: number; negated: number };
  processing_seconds: number;
  findings: Finding[];
}

export interface DocMeta {
  id: string;
  title: string;
  facility: string;
  docType: string;
  received: string;
  sfContentDocumentId: string;
  sfContentVersionId: string;
  pages: number;
  ocrPages: number;
  meanOcrConf: number;
  counts: DocFindings["counts"];
  processingSeconds: number;
  enrichedPdf: string;
  findingsJson: string;
  status: "Auto-Processed" | "Needs Review";
}

export interface Manifest {
  matter: {
    id: string;
    name: string;
    caption: string;
    litifyMatterNumber: string;
    team: string;
    attorney: string;
    status: string;
  };
  documents: DocMeta[];
  generatedAt: string;
  pipelineVersion: string;
}

export async function getManifest(): Promise<Manifest> {
  const r = await fetch("/demo/manifest.json");
  return r.json();
}

export async function getFindings(doc: DocMeta): Promise<DocFindings> {
  const r = await fetch(doc.findingsJson);
  return r.json();
}

export const routingLabel: Record<Routing, string> = {
  auto: "Auto-Accepted",
  review: "Needs Review",
  escalated: "Escalated",
  negated: "Negated",
};

export const routingColor: Record<Routing, string> = {
  auto: "var(--sw-auto)",
  review: "var(--sw-review)",
  escalated: "var(--sw-escalated)",
  negated: "var(--sw-negated)",
};

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
