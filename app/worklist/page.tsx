"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getManifest, Manifest, pct } from "@/lib/demo";
import { StatusChip } from "@/components/ui";

const FILTERS = ["All", "Auto-Processed", "Needs Review"] as const;

export default function Worklist() {
  const [m, setM] = useState<Manifest | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  useEffect(() => { getManifest().then(setM); }, []);

  const rows = useMemo(() => {
    if (!m) return [];
    return m.documents.filter((d) => {
      if (filter !== "All" && d.status !== filter) return false;
      const hay = `${d.title} ${d.facility} ${d.docType}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [m, filter, q]);

  if (!m) return <div className="p-8 text-muted">Loading…</div>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[16px] font-bold mr-3" style={{ color: "var(--sw-navy-ink)" }}>
          Work List <span className="font-normal text-muted text-[13px]">· {m.matter.litifyMatterNumber}</span>
        </h1>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn ${filter === f ? "btn-primary" : "btn-ghost"}`}>{f}</button>
        ))}
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filter documents…"
          className="ml-auto panel px-3 py-[6px] text-[12.5px] w-[240px] outline-none focus:border-[var(--sw-navy)]"
        />
      </div>

      <div className="panel overflow-x-auto">
        <table className="sw-table">
          <thead>
            <tr>
              <th>Document</th><th>Salesforce IDs</th><th>Type</th>
              <th>Pages / OCR</th><th>Mean OCR Conf</th>
              <th>Auto</th><th>Review</th><th>Escal.</th><th>Neg.</th>
              <th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/workbench/${d.id}`} className="font-semibold hover:underline"
                    style={{ color: "var(--sw-navy)" }}>{d.title}</Link>
                  <div className="text-[11px] text-muted">{d.facility} · received {d.received}</div>
                </td>
                <td className="text-[11px] text-muted font-mono leading-4">
                  {d.sfContentDocumentId}<br />{d.sfContentVersionId}
                </td>
                <td>{d.docType}</td>
                <td className="tabular-nums">{d.pages} / {d.ocrPages}</td>
                <td className="tabular-nums">{pct(d.meanOcrConf)}</td>
                <td className="tabular-nums" style={{ color: "var(--sw-auto)" }}>{d.counts.auto}</td>
                <td className="tabular-nums" style={{ color: "var(--sw-review)" }}>{d.counts.review}</td>
                <td className="tabular-nums" style={{ color: "var(--sw-escalated)" }}>{d.counts.escalated}</td>
                <td className="tabular-nums" style={{ color: "var(--sw-negated)" }}>{d.counts.negated}</td>
                <td><StatusChip status={d.status} /></td>
                <td className="whitespace-nowrap">
                  <Link className="btn btn-primary !py-[3px] mr-1" href={`/workbench/${d.id}`}>Workbench</Link>
                  <a className="btn btn-ghost !py-[3px]" href={d.enrichedPdf} target="_blank">Enriched PDF</a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted py-8">No documents match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
