"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, PageHeader, RoutingBadge, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  if (!m || !doc || !findings) return <Skeleton className="h-[80vh] w-full" />;

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
    <div className="grid gap-4">
      <PageHeader
        overline={`${m.matter.name} · ${m.matter.litifyMatterNumber}`}
        title={doc.title}
        description={`${doc.pages} pages · ${
          doc.ocrPages > 0
            ? `${doc.ocrPages} OCR page${doc.ocrPages > 1 ? "s" : ""} · mean confidence ${pct(doc.meanOcrConf)}`
            : "full text layer"
        } · processed in ${doc.processingSeconds}s`}
      >
        <StatusBadge status={doc.status} />
        <div className="mr-1 w-28">
          <div className="text-muted-foreground mb-1 text-right text-xs tabular-nums">
            {decided}/{findings.length} reviewed
          </div>
          <Progress value={findings.length ? (decided / findings.length) * 100 : 0} className="h-1.5" />
        </div>
        <Button variant="outline" asChild>
          <a href={doc.enrichedPdf} target="_blank" rel="noopener noreferrer">
            Open PDF <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button asChild>
          <Link href={`/litify?stage=${doc.id}`}>Stage write-back</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 xl:[grid-template-columns:220px_minmax(0,1fr)_420px]">
        {/* Matter rail */}
        <Card className="gap-0 self-start py-3 shadow-none">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-sm">In this matter</CardTitle>
          </CardHeader>
          <div className="grid gap-0.5 px-2 pb-1">
            {m.documents.map((d) => {
              const on = d.id === doc.id;
              return (
                <Link
                  key={d.id}
                  href={`/workbench/${d.id}`}
                  className={`rounded-md px-2 py-2 text-sm transition-colors ${
                    on ? "bg-accent font-medium" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="leading-snug">{d.docType}</div>
                  <div className="text-muted-foreground text-xs font-normal">
                    {d.pages} pp · {d.counts.total} findings
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* PDF viewer */}
        <Card className="flex h-[76vh] flex-col gap-0 overflow-hidden py-0 shadow-none">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-medium">Enriched document</span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs tabular-nums">
                Page {page} of {doc.pages}
              </span>
              <Button
                variant="outline" size="icon-sm" aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline" size="icon-sm" aria-label="Next page"
                onClick={() => setPage((p) => Math.min(doc.pages, p + 1))}
              >
                <ChevronRight />
              </Button>
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
        <Card className="max-h-[76vh] gap-0 self-start overflow-hidden py-0 shadow-none">
          <Tabs defaultValue="findings" className="flex h-full min-h-0 flex-col gap-0">
            <div className="border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
                <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="findings" className="flex min-h-0 flex-col">
              <div className="border-b px-3 py-2">
                <Tabs
                  value={routingFilter}
                  onValueChange={(v) => setRoutingFilter(v as (typeof ROUTING_FILTERS)[number])}
                >
                  <TabsList className="h-8">
                    {ROUTING_FILTERS.map((r) => (
                      <TabsTrigger key={r} value={r} className="px-2.5 text-xs capitalize">
                        {r}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="bg-muted/60 text-muted-foreground sticky top-0 z-10 border-b px-4 py-1.5 font-mono text-xs tracking-wide uppercase">
                      {cat} · {items.length}
                    </div>
                    {items.map((f) => (
                      <div key={f.idx} className="border-b px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => setPage(f.page)}
                            className="text-left text-sm font-medium hover:underline"
                          >
                            {f.term_label}
                          </button>
                          <ConfMeter value={f.confidence} routing={f.routing} />
                        </div>
                        <p
                          className="text-muted-foreground mt-1 truncate text-xs italic"
                          title={f.evidence}
                        >
                          “…{f.evidence}…”
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <RoutingBadge routing={f.routing} />
                            <Button
                              variant="link" size="sm"
                              className="text-muted-foreground h-auto p-0 text-xs tabular-nums"
                              onClick={() => setPage(f.page)}
                            >
                              p.{f.page}
                            </Button>
                          </span>
                          <span className="flex items-center gap-1.5">
                            {saving === f.idx && (
                              <span className="text-muted-foreground text-xs">Saving…</span>
                            )}
                            <Button
                              size="sm"
                              variant={f.decision === "approved" ? "default" : "outline"}
                              onClick={() => decide(f, "approved")}
                            >
                              Validate
                            </Button>
                            <Button
                              size="sm"
                              variant={f.decision === "rejected" ? "default" : "ghost"}
                              onClick={() => decide(f, "rejected")}
                            >
                              Reject
                            </Button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && (
                  <div className="text-muted-foreground px-4 py-12 text-center text-sm">
                    No findings match this filter.
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="bookmarks" className="min-h-0">
              <ScrollArea className="h-full max-h-[66vh]">
                <div className="px-4 py-3">
                  {[...new Set(findings.filter((f) => !f.negated).map((f) => f.category_label))].map(
                    (cat) => (
                      <div key={cat} className="mb-4">
                        <div className="text-muted-foreground mb-1.5 font-mono text-xs tracking-wide uppercase">
                          {cat}
                        </div>
                        {[...new Set(
                          findings
                            .filter((f) => !f.negated && f.category_label === cat)
                            .map((f) => f.term_label)
                        )].map((term) => {
                          const hits = findings.filter((f) => !f.negated && f.term_label === term);
                          return (
                            <div key={term} className="mb-2">
                              <div className="text-sm font-medium">
                                {term}{" "}
                                <span className="text-muted-foreground text-xs">· {hits.length}</span>
                              </div>
                              {[...new Set(hits.map((h) => h.page))].map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setPage(p)}
                                  className="text-muted-foreground block max-w-full truncate py-0.5 pl-3 text-left text-xs hover:underline"
                                >
                                  p.{p} — {hits.find((h) => h.page === p)!.evidence.slice(0, 52)}…
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                  <p className="text-muted-foreground/70 mt-2 text-xs">
                    Mirrors the outline embedded in the enriched PDF.
                  </p>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="fields" className="min-h-0">
              <ScrollArea className="h-full max-h-[66vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Target field</TableHead>
                      <TableHead>Extracted value</TableHead>
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
                      <TableRow key={k}>
                        <TableCell className="font-mono text-xs">{k}</TableCell>
                        <TableCell className="text-xs">{v}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-muted-foreground/70 px-4 py-3 text-xs">
                  Placeholder targets in the adjustable schema — remapped to the live org’s
                  describe() output at integration time. Nothing writes back without approval.
                </p>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
