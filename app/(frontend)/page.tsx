"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { AuditEvent, getManifest, loadAuditEvents, Manifest, pct } from "@/lib/demo";
import { PageHeader, ROUTING_DOT, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const [m, setM] = useState<Manifest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    getManifest().then(setM);
    loadAuditEvents(8).then(setAudit);
  }, []);

  if (!m) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-20 w-full max-w-xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
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
    { label: "Documents", value: m.documents.length, sub: `${totals.pages} pages · ${totals.secs.toFixed(1)}s pipeline` },
    { label: "Findings", value: totals.total, sub: `across ${m.documents.length} records` },
    { label: "Straight-through", value: pct(straightThrough), sub: "auto-accepted at ≥ 85%" },
    { label: "Awaiting review", value: totals.review + totals.escalated, sub: "confidence 60–85%" },
  ];

  const routingRows: { label: string; n: number; dot: string }[] = [
    { label: "Auto-accepted", n: totals.auto, dot: ROUTING_DOT.auto },
    { label: "Needs review", n: totals.review, dot: ROUTING_DOT.review },
    { label: "Escalated", n: totals.escalated, dot: ROUTING_DOT.escalated },
    { label: "Negated context", n: totals.negated, dot: ROUTING_DOT.negated },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        overline={`${m.matter.litifyMatterNumber} · ${m.matter.team}`}
        title={m.matter.name}
        description={m.matter.caption}
      >
        <StatusBadge status={m.matter.status} />
        <Button variant="outline" asChild>
          <Link href="/worklist">Open work list</Link>
        </Button>
        <Button asChild>
          <Link href="/litify">Litify sync</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-none">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
            <CardFooter className="text-muted-foreground text-xs">{s.sub}</CardFooter>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle>Matter documents</CardTitle>
            <CardDescription>
              Pulled from Litify (simulated) · pipeline v{m.pipelineVersion}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Findings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/workbench/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {d.facility} · received {d.received}
                        {d.ocrPages > 0 && ` · ${d.ocrPages} OCR page${d.ocrPages > 1 ? "s" : ""}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.pages}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.counts.total}
                      {d.counts.review + d.counts.escalated > 0 && (
                        <span className="text-status-warn text-xs">
                          {" "}· {d.counts.review + d.counts.escalated} flagged
                        </span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/workbench/${d.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Routing</CardTitle>
              <CardDescription>Auto-accept threshold at 85% confidence</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {routingRows.map((r) => (
                <div key={r.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full ${r.dot}`} />
                      {r.label}
                    </span>
                    <span className="font-medium tabular-nums">{r.n}</span>
                  </div>
                  <Progress value={totals.total ? (r.n / totals.total) * 100 : 0} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>{audit.length > 0 ? "Live audit trail" : "Pipeline summary"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
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
                <div key={r.key} className="flex items-start gap-3">
                  <ArrowUpRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-medium">{r.event}</div>
                    <div className="text-muted-foreground truncate text-xs">{r.detail}</div>
                    <div className="text-muted-foreground/70 text-xs">{r.meta}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
