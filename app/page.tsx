"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuditEvent, getManifest, loadAuditEvents, Manifest, pct } from "@/lib/demo";
import { DotLabel, PageHeader, ROUTING_FILL, StatusLabel } from "@/components/ui";

export default function Dashboard() {
  const [m, setM] = useState<Manifest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    getManifest().then(setM);
    loadAuditEvents(10).then(setAudit);
  }, []);

  if (!m) return <div className="py-32 text-center meta">Loading…</div>;

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

  const stats: [string, string | number][] = [
    ["documents", m.documents.length],
    ["pages", totals.pages],
    ["findings", totals.total],
    ["straight-through", pct(straightThrough)],
    ["awaiting review", totals.review + totals.escalated],
    ["pipeline time", `${totals.secs.toFixed(1)}s`],
  ];

  const routingRows: [string, number, string][] = [
    ["auto-accepted", totals.auto, ROUTING_FILL.auto],
    ["needs review", totals.review, ROUTING_FILL.review],
    ["escalated", totals.escalated, ROUTING_FILL.escalated],
    ["negated context", totals.negated, ROUTING_FILL.negated],
  ];

  return (
    <div className="space-y-12">
      <PageHeader
        overline={`${m.matter.litifyMatterNumber} · ${m.matter.team}`}
        title={m.matter.name}
        description={m.matter.caption}
      >
        <StatusLabel status={m.matter.status} />
        <Link href="/worklist" className="btn btn-secondary">Open work list</Link>
        <Link href="/litify" className="btn btn-primary">Litify sync</Link>
      </PageHeader>

      {/* Stat band: big numbers over mono labels, hairline separators */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
        style={{ borderTop: "1px solid var(--gray-200)", borderBottom: "1px solid var(--gray-200)" }}
      >
        {stats.map(([label, value], i) => (
          <div
            key={label}
            className="px-6 py-7"
            style={i > 0 ? { borderLeft: "1px solid var(--gray-100)" } : undefined}
          >
            <div
              className="text-[32px] font-medium leading-none tracking-tight tabular-nums"
              style={{ color: "var(--black)" }}
            >
              {value}
            </div>
            <div className="meta-label mt-3">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-12 lg:grid-cols-3">
        {/* Documents as resting-gray article cards */}
        <div className="lg:col-span-2">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl" style={{ color: "var(--black)" }}>Matter documents</h2>
            <span className="meta">pulled from litify (simulated)</span>
          </div>
          <div className="space-y-5">
            {m.documents.map((d) => (
              <article key={d.id} className="card-rest relative flex flex-col p-6">
                <Link href={`/workbench/${d.id}`} className="absolute inset-0 z-10" aria-label={d.title} />
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h3 className="text-lg leading-snug" style={{ color: "var(--black)" }}>
                      {d.title}
                    </h3>
                    <p className="mt-1 text-[13px]" style={{ color: "var(--gray-500)" }}>
                      {d.facility} · received {d.received}
                      {d.ocrPages > 0 && ` · ${d.ocrPages} OCR page${d.ocrPages > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <StatusLabel status={d.status} />
                </div>
                <div
                  className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                  style={{ borderColor: "var(--gray-100)" }}
                >
                  <span className="meta">
                    {d.pages} pages · {d.counts.total} findings
                    {d.counts.review + d.counts.escalated > 0 &&
                      ` · ${d.counts.review + d.counts.escalated} flagged`}
                  </span>
                  <span className="meta">{d.sfContentVersionId}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-12">
          <div>
            <h2 className="mb-6 text-xl" style={{ color: "var(--black)" }}>Routing</h2>
            <div className="space-y-5">
              {routingRows.map(([label, n, color]) => (
                <div key={label}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <DotLabel color={color}>{label}</DotLabel>
                    <span className="meta tabular-nums" style={{ color: "var(--black)" }}>{n}</span>
                  </div>
                  <div className="h-[3px] w-full" style={{ background: "var(--gray-100)" }}>
                    <div
                      className="h-full"
                      style={{ width: pct(totals.total ? n / totals.total : 0), background: color }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[13px] leading-6" style={{ color: "var(--gray-400)" }}>
                Auto-accept at ≥ 85% confidence. 60–85% routes to human review; below that, or on
                extractor disagreement, findings escalate.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-xl" style={{ color: "var(--black)" }}>Activity</h2>
              <span className="meta">{audit.length > 0 ? "live" : "summary"}</span>
            </div>
            <div style={{ borderTop: "1px solid var(--gray-200)" }}>
              {(audit.length > 0
                ? audit.slice(0, 7).map((r) => ({
                    key: String(r.id),
                    event: r.event,
                    detail: r.detail ?? "",
                    when: new Date(r.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    }),
                    tone: r.event.startsWith("review.") ? "var(--warn)"
                      : r.event === "litify.writeback" ? "var(--brand)" : "var(--ok)",
                  }))
                : m.documents.map((d) => ({
                    key: d.id,
                    event: "pipeline.completed",
                    detail: `${d.counts.total} findings in ${d.processingSeconds}s`,
                    when: "—",
                    tone: "var(--ok)",
                  }))
              ).map((r) => (
                <div
                  key={r.key}
                  className="py-4"
                  style={{ borderBottom: "1px solid var(--gray-100)" }}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <DotLabel color={r.tone} strong>{r.event}</DotLabel>
                    <span className="meta">{r.when}</span>
                  </div>
                  <p className="mt-1 truncate pl-[14px] text-[13px]" style={{ color: "var(--gray-500)" }}>
                    {r.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
