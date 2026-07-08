"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuditEvent, getManifest, loadAuditEvents, Manifest, pct } from "@/lib/demo";
import { PageHeader, ROUTING_FILL, StatusBadge } from "@/components/ui";

export default function Dashboard() {
  const [m, setM] = useState<Manifest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    getManifest().then(setM);
    loadAuditEvents(12).then(setAudit);
  }, []);

  if (!m) return <div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>;

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

  const stats: [string, string | number, string][] = [
    ["Documents", m.documents.length, `${totals.pages} pages processed`],
    ["Findings", totals.total, `across ${m.documents.length} records`],
    ["Straight-through", pct(straightThrough), "auto-accepted at ≥ 85%"],
    ["Awaiting review", totals.review + totals.escalated, "confidence 60–85%"],
    ["Pipeline time", `${totals.secs.toFixed(1)}s`, "OCR + match + annotate"],
  ];

  const routingRows: [string, number, string][] = [
    ["Auto-accepted", totals.auto, ROUTING_FILL.auto],
    ["Needs review", totals.review, ROUTING_FILL.review],
    ["Escalated", totals.escalated, ROUTING_FILL.escalated],
    ["Negated context", totals.negated, ROUTING_FILL.negated],
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        overline={`${m.matter.litifyMatterNumber} · ${m.matter.team}`}
        title={m.matter.name}
        description={m.matter.caption}
      >
        <StatusBadge status={m.matter.status} />
        <Link href="/worklist" className="btn btn-secondary">Open work list</Link>
        <Link href="/litify" className="btn btn-primary">Litify sync</Link>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="card px-5 py-4">
            <div className="text-[12px] font-medium" style={{ color: "var(--muted)" }}>{label}</div>
            <div
              className="mt-1 text-[26px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--ink)" }}
            >
              {value}
            </div>
            <div className="mt-2 text-[12px]" style={{ color: "var(--faint)" }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Documents */}
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="card-h">
            <div>
              <div className="card-title">Matter documents</div>
              <div className="card-sub">Pulled from Litify (simulated) · pipeline v{m.pipelineVersion}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th className="num">Pages</th>
                  <th className="num">Findings</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link
                        href={`/workbench/${d.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--ink)" }}
                      >
                        {d.title}
                      </Link>
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
                        {d.facility} · received {d.received}
                        {d.ocrPages > 0 && ` · ${d.ocrPages} OCR page${d.ocrPages > 1 ? "s" : ""}`}
                      </div>
                    </td>
                    <td className="num">{d.pages}</td>
                    <td className="num">
                      {d.counts.total}
                      {d.counts.review + d.counts.escalated > 0 && (
                        <span className="ml-1 text-[12px]" style={{ color: "var(--warn)" }}>
                          · {d.counts.review + d.counts.escalated} flagged
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="text-right">
                      <Link href={`/workbench/${d.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right rail */}
        <div className="grid gap-5 content-start">
          <div className="card">
            <div className="card-h"><div className="card-title">Routing</div></div>
            <div className="grid gap-4 px-5 py-4">
              {routingRows.map(([label, n, color]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                    <span className="inline-flex items-center gap-2" style={{ color: "var(--text)" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {label}
                    </span>
                    <span className="font-medium tabular-nums" style={{ color: "var(--ink)" }}>{n}</span>
                  </div>
                  <div className="h-1 w-full rounded-full" style={{ background: "var(--line)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: pct(totals.total ? n / totals.total : 0), background: color }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[12px] leading-5" style={{ color: "var(--faint)" }}>
                Auto-accept at ≥ 85% confidence; 60–85% routes to human review; below 60% or on
                extractor disagreement, findings escalate.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div className="card-title">Recent activity</div>
              <div className="card-sub">{audit.length > 0 ? "live" : "pipeline summary"}</div>
            </div>
            <div>
              {(audit.length > 0
                ? audit.slice(0, 8).map((r) => ({
                    key: String(r.id),
                    event: r.event,
                    detail: r.detail ?? "",
                    meta: `${r.actor ?? ""} · ${new Date(r.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}`,
                    tone: r.event.startsWith("review.") ? "var(--warn)"
                      : r.event === "litify.writeback" ? "var(--brand)" : "var(--ok)",
                  }))
                : m.documents.map((d) => ({
                    key: d.id,
                    event: "pipeline.completed",
                    detail: `${d.counts.total} findings in ${d.processingSeconds}s`,
                    meta: "pipeline v0.1.0",
                    tone: "var(--ok)",
                  }))
              ).map((r) => (
                <div
                  key={r.key}
                  className="flex gap-3 px-5 py-3"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: r.tone }} />
                  <div className="min-w-0">
                    <div className="mono text-[11.5px]" style={{ color: "var(--ink)" }}>{r.event}</div>
                    <div className="truncate text-[12px]" style={{ color: "var(--muted)" }}>{r.detail}</div>
                    <div className="text-[11.5px]" style={{ color: "var(--faint)" }}>{r.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
