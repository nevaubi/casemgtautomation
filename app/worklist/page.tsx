"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getManifest, Manifest, pct } from "@/lib/demo";
import { PageHeader, StatusBadge } from "@/components/ui";

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
      return `${d.title} ${d.facility} ${d.docType}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [m, filter, q]);

  if (!m) return <div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>;

  return (
    <div className="grid gap-5">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Work list"
        description="Every document pulled for this matter, with pipeline results and routing."
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter documents"
          className="input w-[240px]"
        />
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "All" ? "All" : f === "Auto-Processed" ? "Auto-processed" : "Needs review"}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th className="num">Pages</th>
                <th className="num">OCR conf</th>
                <th className="num">Findings</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-[420px]">
                    <Link
                      href={`/workbench/${d.id}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {d.title}
                    </Link>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
                      {d.facility} · received {d.received}
                    </div>
                    <div className="mono mt-1" style={{ color: "var(--faint)" }}>
                      {d.sfContentDocumentId} · {d.sfContentVersionId}
                    </div>
                  </td>
                  <td>{d.docType}</td>
                  <td className="num">
                    {d.pages}
                    {d.ocrPages > 0 && (
                      <span className="text-[12px]" style={{ color: "var(--muted)" }}> ({d.ocrPages} OCR)</span>
                    )}
                  </td>
                  <td className="num">{pct(d.meanOcrConf)}</td>
                  <td className="num">
                    <div className="inline-flex items-center gap-3 tabular-nums">
                      <span title="Auto-accepted" className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ok)" }} />
                        {d.counts.auto}
                      </span>
                      <span title="Needs review" className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)" }} />
                        {d.counts.review + d.counts.escalated}
                      </span>
                      <span title="Negated context" className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--quiet)" }} />
                        {d.counts.negated}
                      </span>
                    </div>
                  </td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex gap-2">
                      <Link href={`/workbench/${d.id}`} className="btn btn-primary btn-sm">Open workbench</Link>
                      <a href={d.enrichedPdf} target="_blank" className="btn btn-ghost btn-sm">PDF ↗</a>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center" style={{ color: "var(--faint)" }}>
                    No documents match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
