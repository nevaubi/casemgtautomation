"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";

import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, PageHeader, RoutingBadge, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ROUTING_FILTERS = ["all", "auto", "review", "escalated", "negated"] as const;

export default function Workbench({ params }: { params: Promise<{ doc: string }> }) {
  const { doc: docId } = use(params);
  const [m, setM] = useState<Manifest | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [page, setPage] = useState(1);
  const [routingFilter, setRoutingFilter] =
    useState<(typeof ROUTING_FILTERS)[number]>("all");
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => { getManifest().then(setM); }, []);
  const doc: DocMeta | undefined = m?.documents.find((d) => d.id === docId);
  useEffect(() => {
    if (doc) { setFindings(null); loadDocFindings(doc).then(setFindings); }
  }, [doc]);

  const grouped = useMemo(() => {
    if (!findings) return [];
    const filtered = findings.filter(
      (f) => routingFilter === "all" || f.routing === routingFilter
    );
    const byCat = new Map<string, Finding[]>();
    for (const f of filtered) {
      if (!byCat.has(f.category_label)) byCat.set(f.category_label, []);
      byCat.get(f.category_label)!.push(f);
    }
    return [...byCat.entries()];
  }, [findings, routingFilter]);

  if (!m || !doc || !findings) return <Skeleton className="mt-3 h-[85%] w-full" />;

  const decide = async (f: Finding, decision: "approved" | "rejected") => {
    const next: Decision = f.decision === decision ? null : decision;
    setFindings((prev) => prev!.map((x) => (x.idx === f.idx ? { ...x, decision: next } : x)));
    if (next) {
      setSaving(f.idx);
      await recordDecision(doc.id, f.idx, next);
      setSaving(null);
    }
  };

  const decided = findings.filter((f) => f.decision).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title={doc.title}
        description={`${doc.pages} pages · ${
          doc.ocrPages > 0
            ? `${doc.ocrPages} OCR · mean conf ${pct(doc.meanOcrConf)}`
            : "full text layer"
        } · ${doc.processingSeconds}s pipeline`}
      >
        <StatusBadge status={doc.status} />
        <div className="w-24">
          <div className="text-muted-foreground mb-1 text-right text-[11px] tabular-nums">
            {decided}/{findings.length} reviewed
          </div>
          <Progress value={findings.length ? (decided / findings.length) * 100 : 0} className="h-1" />
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={doc.enrichedPdf} target="_blank" rel="noopener noreferrer">
            Open PDF <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/litify?stage=${doc.id}`}>Stage write-back</Link>
        </Button>
      </PageHeader>

      <div className="grid min-h-0 flex-1 gap-3 xl:[grid-template-columns:200px_minmax(0,1fr)_400px]">
        {/* Matter rail */}
        <Card className="hidden h-full min-h-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none xl:flex">
          <div className="shrink-0 border-b px-3 py-2.5 text-sm font-semibold">In this matter</div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
            {m.documents.map((d) => {
              const on = d.id === doc.id;
              return (
                <Link
                  key={d.id}
                  href={`/workbench/${d.id}`}
                  className={`block rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                    on ? "bg-accent font-medium" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="truncate leading-snug">{d.docType}</div>
                  <div className="text-muted-foreground text-[11px] font-normal">
                    {d.pages} pp · {d.counts.total} findings
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* PDF viewer */}
        <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
            <span className="text-sm font-semibold">Enriched document</span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                Page {page} of {doc.pages}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" className="size-7" aria-label="Previous page"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous page</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" className="size-7" aria-label="Next page"
                    onClick={() => setPage((p) => Math.min(doc.pages, p + 1))}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next page</TooltipContent>
              </Tooltip>
            </span>
          </div>
          <iframe
            key={page}
            src={`${doc.enrichedPdf}#page=${page}&zoom=page-width`}
            className="bg-muted w-full flex-1"
            title="Enriched PDF"
          />
        </Card>

        {/* Findings panel */}
        <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
          <Tabs defaultValue="findings" className="flex h-full min-h-0 flex-col gap-0">
            <div className="shrink-0 border-b px-2.5 py-1.5">
              <TabsList className="h-8">
                <TabsTrigger value="findings" className="px-2.5 text-xs">
                  Findings ({findings.length})
                </TabsTrigger>
                <TabsTrigger value="bookmarks" className="px-2.5 text-xs">Bookmarks</TabsTrigger>
                <TabsTrigger value="fields" className="px-2.5 text-xs">Fields</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="findings" className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b px-2.5 py-1.5">
                <Tabs
                  value={routingFilter}
                  onValueChange={(v) => setRoutingFilter(v as (typeof ROUTING_FILTERS)[number])}
                >
                  <TabsList className="h-7">
                    {ROUTING_FILTERS.map((r) => (
                      <TabsTrigger key={r} value={r} className="px-2 text-[11px] capitalize">
                        {r}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="bg-muted/80 text-muted-foreground sticky top-0 z-10 border-b px-3 py-1 font-mono text-[10px] tracking-wide uppercase backdrop-blur-sm">
                      {cat} · {items.length}
                    </div>
                    {items.map((f) => (
                      <div key={f.idx} className="hover:bg-muted/40 border-b px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => setPage(f.page)}
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
                          <span className="flex items-center gap-1">
                            {saving === f.idx && (
                              <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant={f.decision === "approved" ? "default" : "outline"}
                                  className="size-6"
                                  onClick={() => decide(f, "approved")}
                                  disabled={saving === f.idx}
                                  aria-label="Validate"
                                >
                                  <Check className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Validate</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant={f.decision === "rejected" ? "destructive" : "outline"}
                                  className="size-6"
                                  onClick={() => decide(f, "rejected")}
                                  disabled={saving === f.idx}
                                  aria-label="Reject"
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject</TooltipContent>
                            </Tooltip>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && (
                  <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                    No findings match this filter.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-3 py-2.5">
                {[...new Set(findings.filter((f) => !f.negated).map((f) => f.category_label))].map(
                  (cat) => (
                    <div key={cat} className="mb-3">
                      <div className="text-muted-foreground mb-1 font-mono text-[10px] tracking-wide uppercase">
                        {cat}
                      </div>
                      {[...new Set(
                        findings
                          .filter((f) => !f.negated && f.category_label === cat)
                          .map((f) => f.term_label)
                      )].map((term) => {
                        const hits = findings.filter((f) => !f.negated && f.term_label === term);
                        return (
                          <div key={term} className="mb-1.5">
                            <div className="text-[13px] font-medium">
                              {term}{" "}
                              <span className="text-muted-foreground text-[11px]">
                                · {hits.length}
                              </span>
                            </div>
                            {[...new Set(hits.map((h) => h.page))].map((p) => (
                              <button
                                key={p}
                                onClick={() => setPage(p)}
                                className="text-muted-foreground block max-w-full truncate py-px pl-2.5 text-left text-[11px] hover:underline"
                              >
                                p.{p} — {hits.find((h) => h.page === p)!.evidence.slice(0, 56)}…
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
                <p className="text-muted-foreground/70 mt-1 text-[11px]">
                  Mirrors the outline embedded in the enriched PDF.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="fields" className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="bg-card sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-xs font-medium">Target field</TableHead>
                    <TableHead className="h-9 px-3 text-xs font-medium">Extracted value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["litify_pm__Matter__c.Name", m.matter.name],
                    ["Matter_Number__c", m.matter.litifyMatterNumber],
                    ["Primary_Drug__c", "Depo-Provera (medroxyprogesterone acetate)"],
                    ["First_Exposure_Date__c", "2021-04-13"],
                    ["Last_Exposure_Date__c", "2022-07-19"],
                    ["Injection_Count__c", "6 documented administrations"],
                    ["Diagnosis_Code__c", "G93.2 — idiopathic intracranial hypertension"],
                    ["Diagnosis_Confirmed_Date__c", "2022-12-16 (LP, OP 32 cm H2O)"],
                    ["Causation_Language_Present__c", "Yes — neurology consult, p.7"],
                    ["Records_Gap_Flag__c", "Deferred dose ~2022-10-18"],
                  ].map(([k, v]) => (
                    <TableRow key={k} className="hover:bg-muted/50">
                      <TableCell className="px-3 py-2 font-mono text-[11px]">{k}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
              <p className="text-muted-foreground/70 px-3 py-2.5 text-[11px]">
                Placeholder targets in the adjustable schema — remapped to the live org’s
                describe() output at integration time. Nothing writes back without approval.
              </p>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
