"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

import { matchPage, PipeFinding, PipeWord } from "@/lib/client-pipeline";
import type { ExtractionPage } from "@/lib/record-grounding";
import { CaseRecord, loadDocRecords } from "@/lib/records";
import { getManifest } from "@/lib/demo";
import { buildCaseProfile } from "@/lib/case-profile";
import { evaluate } from "@/lib/matrix";
import { ingestDocument, slugFor } from "@/lib/ingest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfMeter, PageHeader, RoutingBadge, TintBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PageState {
  num: number;
  url: string;
  w: number;
  h: number;
  source?: "text_layer" | "ocr";
  meanConf?: number;
  wordCount?: number;
}

interface LogLine {
  id: number;
  time: string;
  text: string;
  kind: "info" | "ok" | "warn" | "alert";
}

type Phase = "idle" | "working" | "done" | "error";

interface TessWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TessWorker {
  recognize: (c: HTMLCanvasElement) => Promise<{ data: { words: TessWord[] } }>;
  terminate: () => Promise<unknown>;
}

const OVERLAY_TINT: Record<string, string> = {
  auto: "bg-emerald-500/25 ring-emerald-600/70",
  review: "bg-amber-500/30 ring-amber-500/80",
  escalated: "bg-orange-500/30 ring-orange-600/80",
  negated: "bg-slate-500/25 ring-slate-500/70",
};

/** One-line title for a record, drawn from whichever fields its type carries. */
function recordTitle(r: CaseRecord): string {
  const d = r.data;
  return (
    d.drug ?? d.condition ?? d.intervention ?? d.field ?? d.name ?? d.statement ?? r.type
  ).slice(0, 60);
}

function recordDetail(r: CaseRecord): string {
  const d = r.data;
  switch (r.type) {
    case "demographic":
      return d.value ?? "";
    case "exposure":
      return [d.dose, d.route, d.frequency, d.start_date && `from ${d.start_date}`, d.prescriber]
        .filter(Boolean).join(" · ");
    case "administration":
      return [d.date, d.dose, d.route, d.site, d.lot && `lot ${d.lot}`, d.administered_by]
        .filter(Boolean).join(" · ");
    case "diagnosis":
      return [d.icd10, d.date, d.diagnosed_by, d.confirming_test].filter(Boolean).join(" · ");
    case "treatment":
      return [d.date, d.cpt, d.result].filter(Boolean).join(" · ");
    case "causation":
      return [d.author, d.date, d.relationship].filter(Boolean).join(" · ");
    case "provider":
      return [d.credential, d.specialty, d.role].filter(Boolean).join(" · ");
    case "negated_finding":
      return [d.date, d.result].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

const LOG_DOT: Record<LogLine["kind"], string> = {
  info: "bg-slate-400",
  ok: "bg-emerald-600",
  warn: "bg-amber-500",
  alert: "bg-orange-600",
};

export default function UploadAndProcess() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const fileNameRef = useRef("");
  const pagesRef = useRef<ExtractionPage[]>([]);
  const [pages, setPages] = useState<PageState[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [findings, setFindings] = useState<PipeFinding[]>([]);
  const [current, setCurrent] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [ocr, setOcr] = useState<{ page: number; pct: number } | null>(null);
  const [records, setRecords] = useState<CaseRecord[]>([]);
  const [ingest, setIngest] = useState<
    | { state: "idle" }
    | { state: "running" }
    | {
        state: "done";
        documentId: string;
        before: number;
        after: number;
        beforeTier: string;
        afterTier: string;
        changes: string[];
      }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [extraction, setExtraction] = useState<
    | { state: "idle" }
    | { state: "running" }
    | { state: "done"; proposed: number; rejected: number }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logId = useRef(0);
  const cancelled = useRef(false);

  const addLog = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    const time = new Date().toLocaleTimeString(undefined, {
      hour12: false, minute: "2-digit", second: "2-digit",
    });
    setLog((l) => [...l, { id: logId.current++, time, text, kind }]);
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }, []);

  const reset = useCallback(() => {
    cancelled.current = true;
    setPhase("idle");
    setFileName("");
    setPages([]);
    setLog([]);
    setFindings([]);
    setRecords([]);
    setExtraction({ state: "idle" });
    setIngest({ state: "idle" });
    setCurrent(1);
    setOcr(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const counts = useMemo(() => {
    const c = { total: findings.length, auto: 0, review: 0, escalated: 0, negated: 0 };
    for (const f of findings) c[f.routing]++;
    return c;
  }, [findings]);

  /**
   * Structured record extraction — one Claude Sonnet 5 call for the whole
   * document, then server-side grounding of every record it returns against
   * the exact page words we just produced. Anything the page does not support
   * is rejected; we show that number rather than hide it.
   */
  const extractRecords = useCallback(
    async (docPages: ExtractionPage[]) => {
      setExtraction({ state: "running" });
      addLog(`Sending ${docPages.length} page(s) of text to claude-sonnet-5 for record extraction…`);
      // The function's own ceiling is 300s; give up slightly before that rather
      // than leaving the panel spinning on a request the platform already killed.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 295_000);
      try {
        const res = await fetch("/api/extract-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: "upload",
            filename: fileNameRef.current,
            pages: docPages,
          }),
          signal: abort.signal,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);

        setRecords(j.records as CaseRecord[]);
        setExtraction({
          state: "done",
          proposed: j.counts.proposed,
          rejected: j.counts.rejected,
        });
        addLog(
          `Extraction complete — ${j.counts.proposed} records proposed, ${j.counts.grounded} grounded ` +
            `(${j.counts.auto} auto / ${j.counts.review} review / ${j.counts.escalated} escalated).`,
          j.counts.escalated > 0 ? "alert" : "ok"
        );
        if (j.counts.rejected > 0) {
          addLog(
            `${j.counts.rejected} record(s) rejected — the quote could not be located on the cited ` +
              `page, so the claim was discarded.`,
            "warn"
          );
        }
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Extraction timed out. This document is long enough that a single call " +
              "exceeds the function limit — run it through the batch pipeline instead."
            : err instanceof Error
              ? err.message
              : String(err);
        setExtraction({ state: "error", message });
        addLog(`Record extraction unavailable: ${message}`, "warn");
      } finally {
        clearTimeout(timer);
      }
    },
    [addLog]
  );

  /**
   * Add the extracted document to the case file, then re-score.
   *
   * This is the loop closing. The records go into the same table the seeded
   * documents live in; nothing downstream is told an ingest happened. The grid
   * simply sees a seventh document and recomputes, because the score is a pure
   * function of the record set — so the delta shown here is not a simulation of
   * a re-score, it *is* the re-score.
   */
  const addToCase = useCallback(async () => {
    if (records.length === 0) return;
    setIngest({ state: "running" });
    addLog("Adding document to the case file…");
    try {
      const manifestBefore = await getManifest();
      const recsBefore = new Map(
        await Promise.all(
          manifestBefore.documents.map(
            async (d) => [d.id, await loadDocRecords(d)] as const
          )
        )
      );
      const before = evaluate(buildCaseProfile(manifestBefore, recsBefore));

      const documentId = slugFor(fileNameRef.current);
      const ocrPages = pagesRef.current.filter((p) => p.source === "ocr");
      const res = await ingestDocument({
        matterId: manifestBefore.matter.id,
        documentId,
        title: fileNameRef.current.replace(/\.pdf$/i, ""),
        facility: "Uploaded — facility not yet assigned",
        pages: pagesRef.current.length,
        ocrPages: ocrPages.length,
        meanOcrConf:
          ocrPages.length > 0
            ? ocrPages.reduce((s, p) => s + p.mean_conf, 0) / ocrPages.length
            : 0.99,
        records,
      });
      if (!res.ok) throw new Error(res.error ?? "ingest failed");

      const manifestAfter = await getManifest();
      const recsAfter = new Map(
        await Promise.all(
          manifestAfter.documents.map(
            async (d) => [d.id, await loadDocRecords(d)] as const
          )
        )
      );
      const after = evaluate(buildCaseProfile(manifestAfter, recsAfter));

      const changes = after.factors
        .map((f) => {
          const b = before.factors.find((x) => x.key === f.key);
          if (!b || (b.status === f.status && b.points === f.points)) return null;
          const d = f.points - b.points;
          return `${f.label}: ${b.status} → ${f.status}${d !== 0 ? ` (${d > 0 ? "+" : ""}${d})` : ""}`;
        })
        .filter((x): x is string => !!x);

      setIngest({
        state: "done",
        documentId,
        before: before.points,
        after: after.points,
        beforeTier: before.tier.label,
        afterTier: after.tier.label,
        changes,
      });
      addLog(
        `Document ingested. Settlement grid re-scored: ${before.points} → ${after.points} points ` +
          `(${before.tier.label} → ${after.tier.label}).`,
        after.points > before.points ? "ok" : "info"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setIngest({ state: "error", message });
      addLog(`Ingest failed: ${message}`, "alert");
    }
  }, [records, addLog]);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        setPhase("error");
        addLog(`"${file.name}" is not a PDF — drop a .pdf file.`, "alert");
        return;
      }
      cancelled.current = false;
      setPhase("working");
      setFileName(file.name);
      fileNameRef.current = file.name;
      setPages([]);
      setFindings([]);
      setLog([]);
      setCurrent(1);
      addLog(`Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`);

      let tessWorker: TessWorker | null = null;

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        addLog(`Document opened — ${pdf.numPages} page(s). Extracting per page…`, "ok");

        let findingIdx = 0;
        const collected: ExtractionPage[] = [];

        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled.current) return;
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const url = canvas.toDataURL("image/jpeg", 0.82);
          setPages((p) => [...p, { num: n, url, w: canvas.width, h: canvas.height }]);
          setCurrent(n);

          // 1) Try the native text layer (mirrors extract.py: use it when >= 5 words)
          const tc = await page.getTextContent();
          const util = (pdfjs as unknown as { Util: { transform: (a: number[], b: number[]) => number[] } }).Util;
          let words: PipeWord[] = [];
          for (const raw of tc.items as { str?: string; transform: number[]; width: number }[]) {
            const str = raw.str ?? "";
            if (!str.trim()) continue;
            const m = util.transform(viewport.transform as unknown as number[], raw.transform);
            const fontH = Math.hypot(m[2], m[3]) || 12;
            const x = m[4];
            const yBase = m[5];
            const totalW = raw.width * viewport.scale;
            const chars = str.length || 1;
            for (const wm of str.matchAll(/\S+/g)) {
              const s = wm.index ?? 0;
              const x0 = x + (s / chars) * totalW;
              const x1 = x + ((s + wm[0].length) / chars) * totalW;
              words.push({ text: wm[0], x0, y0: yBase - fontH, x1, y1: yBase, conf: 0.99 });
            }
          }

          let source: "text_layer" | "ocr" = "text_layer";
          let meanConf = 0.99;
          if (words.length >= 5) {
            addLog(`Page ${n}: native text layer — ${words.length} words (conf 99%)`, "ok");
          } else {
            // 2) OCR fallback (mirrors extract.py's tesseract path)
            source = "ocr";
            addLog(`Page ${n}: no usable text layer (${words.length} words) → OCR`, "warn");
            if (!tessWorker) {
              addLog("Starting tesseract.js — first run downloads the eng model (~15 MB)…");
              const { createWorker } = await import("tesseract.js");
              tessWorker = (await createWorker("eng", 1, {
                workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
                corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0",
                langPath: "https://tessdata.projectnaptha.com/4.0.0",
                logger: (msg: { status: string; progress: number }) => {
                  if (msg.status === "recognizing text") {
                    setOcr((o) => (o ? { ...o, pct: Math.round(msg.progress * 100) } : o));
                  }
                },
              })) as unknown as TessWorker;
              addLog("OCR engine ready.", "ok");
            }
            setOcr({ page: n, pct: 0 });
            const { data } = await tessWorker!.recognize(canvas);
            setOcr(null);
            words = data.words
              .filter((w) => w.text.trim())
              .map((w) => ({
                text: w.text,
                x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1,
                conf: Math.max(0, Math.min(1, w.confidence / 100)),
              }));
            const mean = words.length
              ? words.reduce((s, w) => s + w.conf, 0) / words.length
              : 0;
            addLog(
              `Page ${n}: OCR complete — ${words.length} words, mean confidence ${(mean * 100).toFixed(0)}%`,
              mean < 0.7 ? "warn" : "ok"
            );
            meanConf = mean;
            setPages((p) => p.map((pg) => (pg.num === n ? { ...pg, meanConf: mean } : pg)));
          }
          setPages((p) =>
            p.map((pg) => (pg.num === n ? { ...pg, source, wordCount: words.length } : pg))
          );

          collected.push({ number: n, source, mean_conf: meanConf, words });

          // 3) Term matching + routing (same taxonomy + thresholds as the server pipeline)
          const pageFindings = matchPage(words, n, source, findingIdx);
          findingIdx += pageFindings.length;
          if (pageFindings.length > 0) {
            setFindings((f) => [...f, ...pageFindings]);
            const c = { auto: 0, review: 0, escalated: 0, negated: 0 };
            for (const f of pageFindings) c[f.routing]++;
            addLog(
              `Page ${n}: ${pageFindings.length} term match(es) — ${c.auto} auto / ${c.review} review / ${c.escalated} escalated / ${c.negated} negated`,
              c.escalated > 0 ? "alert" : c.review > 0 ? "warn" : "ok"
            );
          } else {
            addLog(`Page ${n}: no taxonomy terms matched`);
          }
        }

        addLog("Processing complete.", "ok");
        setPhase("done");
        setCurrent(1);

        // 4) Structured record extraction (Claude Sonnet 5). The PDF never
        // leaves the browser — only the page word stream is sent, and every
        // record that comes back is grounded against those same words before
        // it is shown. Records the page cannot support are rejected, and the
        // rejection count is displayed rather than hidden.
        pagesRef.current = collected;
        await extractRecords(collected);
      } catch (err) {
        setPhase("error");
        addLog(`Processing failed: ${err instanceof Error ? err.message : String(err)}`, "alert");
      } finally {
        setOcr(null);
        if (tessWorker) await tessWorker.terminate().catch(() => {});
      }
    },
    [addLog, extractRecords]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const page = pages.find((p) => p.num === current);
  const pageFindings = findings.filter((f) => f.page === current);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline="Browser pipeline · same taxonomy and thresholds"
        title="Upload &amp; process"
        description="Drop any PDF to watch text extraction, OCR, term matching, negation checks, and confidence routing run live."
      >
        {phase === "done" && (
          <>
            <TintBadge tone="emerald">{counts.auto} auto</TintBadge>
            <TintBadge tone="amber">{counts.review} review</TintBadge>
            {counts.escalated > 0 && <TintBadge tone="orange">{counts.escalated} escalated</TintBadge>}
            {counts.negated > 0 && <TintBadge tone="slate">{counts.negated} negated</TintBadge>}
          </>
        )}
        {extraction.state === "done" && records.length > 0 && ingest.state !== "done" && (
          <Button size="sm" onClick={addToCase} disabled={ingest.state === "running"}>
            {ingest.state === "running" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FilePlus2 className="size-3.5" />
            )}
            Add to case file &amp; re-score
          </Button>
        )}
        {phase !== "idle" && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" /> Process another
          </Button>
        )}
      </PageHeader>

      {ingest.state === "done" && (
        <Card className="shrink-0 gap-0 rounded-lg border-emerald-600/30 bg-emerald-500/5 py-0 shadow-none">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div>
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Settlement grid re-scored
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground text-lg tabular-nums line-through">
                  {ingest.before}
                </span>
                <ArrowRight className="text-muted-foreground size-3.5" />
                <span className="text-2xl font-semibold tabular-nums">{ingest.after}</span>
                <span className="text-muted-foreground text-[13px]">points</span>
                <span
                  className={`ml-1 rounded px-2 py-0.5 text-[12px] font-semibold ${
                    ingest.afterTier !== ingest.beforeTier
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {ingest.afterTier}
                  {ingest.afterTier !== ingest.beforeTier && ` (was ${ingest.beforeTier})`}
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                What this document changed
              </div>
              {ingest.changes.length === 0 ? (
                <p className="text-[13px]">
                  Nothing scoreable — the records are in the file, but no matrix factor moved.
                </p>
              ) : (
                <ul className="text-[12px]">
                  {ingest.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href="/grid">
                Open settlement grid <ArrowRight className="size-3.5" />
              </a>
            </Button>
          </div>
        </Card>
      )}
      {ingest.state === "error" && (
        <Card className="shrink-0 rounded-lg border-orange-600/30 bg-orange-500/5 px-4 py-2 text-[12px] text-orange-800 shadow-none">
          Ingest failed: {ingest.message}
        </Card>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) processFile(f);
        }}
      />

      {phase === "idle" || phase === "error" ? (
        <Card
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-0 shadow-none transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <UploadCloud className="text-muted-foreground size-6" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold">Drag &amp; drop a PDF here</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              Born-digital PDFs use the text layer; scanned pages fall back to OCR in your browser.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              Browse files
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/records/mock_record_06_urgent_care_fax_scanned.pdf" download>
                <FileText className="size-3.5" /> Download sample fax to try
              </a>
            </Button>
          </div>
          {phase === "error" && log.length > 0 && (
            <p className="text-xs text-orange-700">{log[log.length - 1].text}</p>
          )}
          <p className="text-muted-foreground/70 max-w-md px-6 text-center text-[11px]">
            Files are processed locally in this tab — nothing is uploaded. The matcher uses the
            identical term taxonomy, negation cues, and 85%/60% routing thresholds as the server
            pipeline.
          </p>
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:[grid-template-columns:minmax(0,1fr)_400px]">
          {/* Page viewer with live highlight overlays */}
          <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
              <span className="min-w-0 truncate text-[13px] font-semibold">{fileName}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {page?.source && (
                  <span className="text-muted-foreground mr-1 text-[11px]">
                    {page.source === "ocr"
                      ? `OCR · mean ${((page.meanConf ?? 0) * 100).toFixed(0)}%`
                      : "text layer"}
                  </span>
                )}
                <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                  Page {current} of {pages.length}
                </span>
                <Button
                  variant="outline" size="icon" className="size-7" aria-label="Previous page"
                  onClick={() => setCurrent((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline" size="icon" className="size-7" aria-label="Next page"
                  onClick={() => setCurrent((p) => Math.min(pages.length, p + 1))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </span>
            </div>
            <div className="bg-muted min-h-0 flex-1 overflow-auto p-4">
              {page ? (
                <div
                  className="relative mx-auto max-w-[820px] bg-white shadow-sm"
                  style={{ aspectRatio: `${page.w} / ${page.h}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.url} alt={`Page ${page.num}`} className="block h-full w-full" />
                  {pageFindings.flatMap((f) =>
                    f.rects.map((r, ri) => (
                      <span
                        key={`${f.idx}-${ri}`}
                        title={`${f.term_label} — ${(f.confidence * 100).toFixed(0)}% (${f.routing})`}
                        className={`absolute rounded-[2px] ring-1 ${OVERLAY_TINT[f.routing]}`}
                        style={{
                          left: `${(r[0] / page.w) * 100}%`,
                          top: `${(r[1] / page.h) * 100}%`,
                          width: `${((r[2] - r[0]) / page.w) * 100}%`,
                          height: `${((r[3] - r[1]) / page.h) * 100}%`,
                        }}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Rendering…
                </div>
              )}
            </div>
          </Card>

          {/* Activity + findings */}
          <div className="flex h-full min-h-0 flex-col gap-3">
            <Card className="flex h-[38%] min-h-[150px] shrink-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
                <span className="text-[13px] font-semibold">Pipeline activity</span>
                {phase === "working" && (
                  <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                )}
              </div>
              <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {log.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 py-0.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${LOG_DOT[l.kind]}`} />
                    <span className="text-muted-foreground shrink-0 font-mono text-[10px] leading-5">
                      {l.time}
                    </span>
                    <span className="font-mono text-[11px] leading-5 break-words">{l.text}</span>
                  </div>
                ))}
                {ocr && (
                  <div className="mt-1 flex items-center gap-2 pl-3.5">
                    <Progress value={ocr.pct} className="h-1 flex-1" />
                    <span className="text-muted-foreground w-16 text-right font-mono text-[10px]">
                      OCR {ocr.pct}%
                    </span>
                  </div>
                )}
              </div>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
              <Tabs defaultValue="records" className="flex min-h-0 flex-1 flex-col gap-0">
                <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
                  <TabsList className="h-7">
                    <TabsTrigger value="records" className="h-6 text-[11px]">
                      Records ({records.length})
                    </TabsTrigger>
                    <TabsTrigger value="findings" className="h-6 text-[11px]">
                      Term matches ({findings.length})
                    </TabsTrigger>
                  </TabsList>
                  {extraction.state === "running" && (
                    <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                      <Loader2 className="size-3 animate-spin" /> extracting
                    </span>
                  )}
                  {extraction.state === "done" && extraction.rejected > 0 && (
                    <TintBadge tone="orange">{extraction.rejected} ungrounded, dropped</TintBadge>
                  )}
                </div>

                {/* Structured records — what a fact sheet is actually built from */}
                <TabsContent value="records" className="min-h-0 flex-1 overflow-y-auto">
                  {records.map((r) => (
                    <div key={r.id} className="hover:bg-muted/40 border-b px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setCurrent(r.page)}
                          className="min-w-0 truncate text-left text-[13px] font-medium hover:underline"
                        >
                          {recordTitle(r)}
                          <span className="text-muted-foreground ml-1.5 text-[11px] font-normal tabular-nums">
                            p.{r.page}
                          </span>
                        </button>
                        <ConfMeter value={r.confidence} routing={r.routing} />
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
                        {recordDetail(r)}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-[11px] italic" title={r.quote}>
                        “{r.quote}”
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1">
                          <TintBadge tone="slate">{r.type.replace("_", " ")}</TintBadge>
                          <RoutingBadge routing={r.routing} />
                          {r.reported_by && <TintBadge tone="slate">via {r.reported_by}</TintBadge>}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {(r.grounding * 100).toFixed(0)}% grounded × {(r.page_conf * 100).toFixed(0)}%{" "}
                          {r.source === "ocr" ? "OCR" : "text"} · {r.certainty}
                        </span>
                      </div>
                    </div>
                  ))}
                  {records.length === 0 && (
                    <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                      {extraction.state === "running"
                        ? "Claude Sonnet 5 is reading the document…"
                        : extraction.state === "error"
                          ? extraction.message
                          : phase === "working"
                            ? "Records are extracted once every page has been read."
                            : "No structured records extracted from this document."}
                    </div>
                  )}
                </TabsContent>

                {/* Deterministic term matches — the evidence spine, unchanged */}
                <TabsContent value="findings" className="min-h-0 flex-1 overflow-y-auto">
                  {findings.map((f) => (
                    <div key={f.idx} className="hover:bg-muted/40 border-b px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setCurrent(f.page)}
                          className="min-w-0 truncate text-left text-[13px] font-medium hover:underline"
                        >
                          {f.term_label}
                          <span className="text-muted-foreground ml-1.5 text-[11px] font-normal tabular-nums">
                            p.{f.page}
                          </span>
                        </button>
                        <ConfMeter value={f.confidence} routing={f.routing} />
                      </div>
                      <p
                        className="text-muted-foreground mt-0.5 truncate text-[11px] italic"
                        title={f.evidence}
                      >
                        “…{f.evidence}…”
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <RoutingBadge routing={f.routing} />
                        <span className="text-muted-foreground text-[10px]">
                          {(f.match_quality * 100).toFixed(0)}% match ×{" "}
                          {(f.ocr_conf * 100).toFixed(0)}% {f.source === "ocr" ? "OCR" : "text"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {findings.length === 0 && (
                    <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                      {phase === "working"
                        ? "Matches appear here as each page completes…"
                        : "No taxonomy terms found in this document."}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
