"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, PanelsTopLeft } from "lucide-react";

import { AuditEvent, getManifest, loadAuditEvents, Manifest, pct } from "@/lib/demo";
import { PageHeader, ROUTING_DOT, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function Dashboard() {
  const [m, setM] = useState<Manifest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    getManifest().then(setM);
    loadAuditEvents(10).then(setAudit);
  }, []);

  if (!m) {
    return (
      <div className="grid h-full content-start gap-3 pt-3">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const totals = m.documents.reduce(
    (a, d) => ({
      total: a.total + d.counts.total,
      auto: a.auto + d.counts.auto,
      review: a.review + d.counts.review,
      escalated: a.escalated + d.counts.escalated,
      negated: a.negated + d.counts.negated,
      pages: a.pages + d.pages,
      secs: a.secs + d.processingSeconds,
    }),
    { total: 0, auto: 0, review: 0, escalated: 0, negated: 0, pages: 0, secs: 0 }
  );
  const straightThrough = totals.total ? totals.auto / totals.total : 0;

  const stats: { label: string; value: string | number; sub: string }[] = [
    { label: "Documents", value: m.documents.length, sub: `${totals.pages} pages` },
    { label: "Findings", value: totals.total, sub: `${m.documents.length} records` },
    { label: "Straight-through", value: pct(straightThrough), sub: "auto ≥ 85%" },
    { label: "Awaiting review", value: totals.review + totals.escalated, sub: "60–85% conf" },
    { label: "Pipeline time", value: `${totals.secs.toFixed(1)}s`, sub: "OCR + match" },
  ];

  const routingRows: { label: string; n: number; dot: string }[] = [
    { label: "Auto-accepted", n: totals.auto, dot: ROUTING_DOT.auto },
    { label: "Needs review", n: totals.review, dot: ROUTING_DOT.review },
    { label: "Escalated", n: totals.escalated, dot: ROUTING_DOT.escalated },
    { label: "Negated context", n: totals.negated, dot: ROUTING_DOT.negated },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={`${m.matter.litifyMatterNumber} · ${m.matter.team}`}
        title={m.matter.name}
        description={m.matter.caption}
      >
        <StatusBadge status={m.matter.status} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/worklist">Open work list</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/litify">Litify sync</Link>
        </Button>
      </PageHeader>

      {/* KPI strip */}
      <Card className="grid shrink-0 grid-cols-2 gap-0 divide-y rounded-lg py-0 shadow-none sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-5 xl:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-2.5">
            <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              {s.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xl leading-none font-semibold tabular-nums">{s.value}</span>
              <span className="text-muted-foreground text-[11px]">{s.sub}</span>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
        {/* Documents */}
        <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none lg:col-span-2">
          <div className="flex shrink-0 items-baseline justify-between gap-3 border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Matter documents</span>
            <span className="text-muted-foreground text-xs">
              Pulled from Litify (simulated) · pipeline v{m.pipelineVersion}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 px-4 font-medium">Document</TableHead>
                  <TableHead className="h-10 px-4 text-right font-medium">Pages</TableHead>
                  <TableHead className="h-10 px-4 text-right font-medium">Findings</TableHead>
                  <TableHead className="h-10 px-4 font-medium">Status</TableHead>
                  <TableHead className="h-10 w-[90px] px-4 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.documents.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/50">
                    <TableCell className="px-4 py-2.5">
                      <Link href={`/workbench/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {d.facility} · received {d.received}
                        {d.ocrPages > 0 && ` · ${d.ocrPages} OCR page${d.ocrPages > 1 ? "s" : ""}`}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">{d.pages}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {d.counts.total}
                      {d.counts.review + d.counts.escalated > 0 && (
                        <span className="text-[11px] text-amber-700">
                          {" "}· {d.counts.review + d.counts.escalated} flagged
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="size-7" asChild>
                              <Link href={`/workbench/${d.id}`} aria-label="Open workbench">
                                <PanelsTopLeft className="size-3.5" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open workbench</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="size-7" asChild>
                              <a
                                href={d.enrichedPdf}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open enriched PDF"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Enriched PDF</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </Card>

        {/* Right rail */}
        <div className="flex h-full min-h-0 flex-col gap-3">
          <Card className="shrink-0 gap-0 rounded-lg py-0 shadow-none">
            <div className="border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Routing</span>
              <span className="text-muted-foreground ml-2 text-xs">auto-accept at 85%</span>
            </div>
            <div className="grid gap-2.5 px-4 py-3">
              {routingRows.map((r) => (
                <div key={r.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${r.dot}`} />
                      {r.label}
                    </span>
                    <span className="font-medium tabular-nums">{r.n}</span>
                  </div>
                  <Progress value={totals.total ? (r.n / totals.total) * 100 : 0} className="h-1" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
            <div className="flex shrink-0 items-baseline justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Recent activity</span>
              <span className="text-muted-foreground text-xs">
                {audit.length > 0 ? "live audit trail" : "pipeline summary"}
              </span>
            </div>
            <div className="min-h-0 flex-1 divide-y overflow-y-auto">
              {(audit.length > 0
                ? audit.map((r) => ({
                    key: String(r.id),
                    event: r.event,
                    detail: r.detail ?? "",
                    meta: new Date(r.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    }),
                  }))
                : m.documents.map((d) => ({
                    key: d.id,
                    event: "pipeline.completed",
                    detail: `${d.counts.total} findings in ${d.processingSeconds}s`,
                    meta: "pipeline v0.1.0",
                  }))
              ).map((r) => (
                <div key={r.key} className="flex items-start gap-2.5 px-4 py-2">
                  <ArrowUpRight className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[11px] font-medium">{r.event}</span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">{r.meta}</span>
                    </div>
                    <div className="text-muted-foreground truncate text-[11px]">{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
