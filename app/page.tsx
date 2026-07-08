"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getManifest, Manifest, pct } from "@/lib/demo";
import { StatusChip } from "@/components/ui";

export default function Dashboard() {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => { getManifest().then(setM); }, []);
  if (!m) return <div className="p-8 text-muted">Loading…</div>;

  const totals = m.documents.reduce(
    (a, d) => ({
      total: a.total + d.counts.total,
      auto: a.auto + d.counts.auto,
      review: a.review + d.counts.review,
      escalated: a.escalated + d.counts.escalated,
      negated: a.negated + d.counts.negated,
      pages: a.pages + d.pages,
      ocrPages: a.ocrPages + d.ocrPages,
      secs: a.secs + d.processingSeconds,
    }),
    { total: 0, auto: 0, review: 0, escalated: 0, negated: 0, pages: 0, ocrPages: 0, secs: 0 }
  );
  const straightThrough = totals.total ? totals.auto / totals.total : 0;

  return (
    <div className="grid gap-4">
      {/* Matter banner */}
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
        <div>
          <div className="text-[15px] font-bold" style={{ color: "var(--sw-navy-ink)" }}>
            {m.matter.name} <span className="font-normal text-muted">· {m.matter.litifyMatterNumber}</span>
          </div>
          <div className="text-[12px] text-muted">{m.matter.caption}</div>
        </div>
        <div className="text-[12px]"><span className="text-muted">Team </span><b>{m.matter.team}</b></div>
        <div className="text-[12px]"><span className="text-muted">Stage </span><b>{m.matter.status}</b></div>
        <div className="ml-auto flex gap-2">
          <Link href="/worklist" className="btn btn-primary">Open Work List</Link>
          <Link href="/litify" className="btn btn-outline">Litify Sync</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          [m.documents.length, "Documents Processed"],
          [totals.pages, "Pages"],
          [totals.total, "Findings Extracted"],
          [pct(straightThrough), "Straight-Through Rate"],
          [totals.review + totals.escalated, "In Review Queue"],
          [`${totals.secs.toFixed(1)}s`, "Total Pipeline Time"],
        ].map(([v, l]) => (
          <div key={String(l)} className="panel kpi">
            <div className="v">{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Routing distribution */}
        <div className="panel">
          <div className="panel-h">Routing Distribution</div>
          <div className="p-4 grid gap-3">
            {(
              [
                ["Auto-Accepted", totals.auto, "var(--sw-auto)"],
                ["Needs Review", totals.review, "var(--sw-review)"],
                ["Escalated", totals.escalated, "var(--sw-escalated)"],
                ["Negated (context)", totals.negated, "var(--sw-negated)"],
              ] as [string, number, string][]
            ).map(([label, n, color]) => (
              <div key={label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="font-medium">{label}</span>
                  <span className="tabular-nums font-semibold" style={{ color }}>{n}</span>
                </div>
                <div className="confbar">
                  <div style={{ width: pct(totals.total ? n / totals.total : 0), background: color }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted mt-1">
              Confidence-gated routing: auto ≥ 85%, review 60–85%, escalation &lt; 60% or extractor disagreement.
            </p>
          </div>
        </div>

        {/* Document table */}
        <div className="panel lg:col-span-2">
          <div className="panel-h">
            <span>Matter Documents</span>
            <span className="text-[10.5px] font-normal normal-case text-muted">
              source: Litify (simulated) · pipeline v{m.pipelineVersion}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Document</th><th>Type</th><th>Pages</th><th>OCR</th>
                  <th>Findings</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {m.documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="font-semibold" style={{ color: "var(--sw-navy-ink)" }}>{d.title}</div>
                      <div className="text-[11px] text-muted">{d.facility} · received {d.received}</div>
                    </td>
                    <td>{d.docType}</td>
                    <td className="tabular-nums">{d.pages}</td>
                    <td className="tabular-nums">{d.ocrPages > 0 ? `${d.ocrPages} pg` : "—"}</td>
                    <td className="tabular-nums">
                      {d.counts.total}
                      <span className="text-muted text-[11px]"> ({d.counts.review + d.counts.escalated} flagged)</span>
                    </td>
                    <td><StatusChip status={d.status} /></td>
                    <td>
                      <Link className="btn btn-outline !py-[3px]" href={`/workbench/${d.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Audit trail preview */}
      <div className="panel">
        <div className="panel-h">Audit Trail (most recent)</div>
        <div className="overflow-x-auto">
          <table className="sw-table">
            <thead><tr><th>Event</th><th>Document</th><th>Detail</th><th>Actor</th></tr></thead>
            <tbody>
              {m.documents.flatMap((d) => [
                { e: "pipeline.completed", doc: d.title, det: `${d.counts.total} findings · ${d.processingSeconds}s · mean OCR conf ${pct(d.meanOcrConf)}`, a: "pipeline v0.1.0" },
                { e: "litify.pull", doc: d.title, det: `ContentVersion ${d.sfContentVersionId} downloaded (simulated)`, a: "litify-connector" },
              ]).map((r, i) => (
                <tr key={i}>
                  <td><span className="chip chip-neutral">{r.e}</span></td>
                  <td>{r.doc}</td>
                  <td className="text-muted">{r.det}</td>
                  <td className="text-muted">{r.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
