"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getManifest, Manifest, pct } from "@/lib/demo";
import { PageHeader, StatusLabel } from "@/components/ui";

const FILTERS = [
  ["All", "all"],
  ["Auto-Processed", "auto-processed"],
  ["Needs Review", "needs review"],
] as const;

export default function Worklist() {
  const [m, setM] = useState<Manifest | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [q, setQ] = useState("");
  useEffect(() => { getManifest().then(setM); }, []);

  const rows = useMemo(() => {
    if (!m) return [];
    return m.documents.filter((d) => {
      if (filter !== "All" && d.status !== filter) return false;
      return `${d.title} ${d.facility} ${d.docType}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [m, filter, q]);

  if (!m) return <div className="py-32 text-center meta">Loading…</div>;

  return (
    <div className="space-y-10">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Work list"
        description="Every document pulled for this matter, with pipeline results and routing."
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter documents"
          className="input w-[220px]"
        />
        <div className="seg">
          {FILTERS.map(([value, label]) => (
            <button key={value} className={filter === value ? "on" : ""} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>document</th>
              <th>type</th>
              <th className="num">pages</th>
              <th className="num">ocr conf</th>
              <th className="num">findings</th>
              <th>status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="max-w-[400px]">
                  <Link href={`/workbench/${d.id}`} className="link text-[15px] font-medium"
                    style={{ color: "var(--black)" }}>
                    {d.title}
                  </Link>
                  <div className="mt-1 text-[13px]" style={{ color: "var(--gray-500)" }}>
                    {d.facility} · received {d.received}
                  </div>
                  <div className="meta mt-2" style={{ color: "var(--gray-400)" }}>
                    {d.sfContentDocumentId} · {d.sfContentVersionId}
                  </div>
                </td>
                <td className="text-[13px]">{d.docType}</td>
                <td className="num text-[13px]">
                  {d.pages}
                  {d.ocrPages > 0 && (
                    <span style={{ color: "var(--gray-400)" }}> ({d.ocrPages} ocr)</span>
                  )}
                </td>
                <td className="num text-[13px]">{pct(d.meanOcrConf)}</td>
                <td className="num">
                  <span className="meta inline-flex gap-4 tabular-nums" style={{ color: "var(--gray-600)" }}>
                    <span title="auto-accepted" className="inline-flex items-center gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--ok)" }} />
                      {d.counts.auto}
                    </span>
                    <span title="flagged for review" className="inline-flex items-center gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--warn)" }} />
                      {d.counts.review + d.counts.escalated}
                    </span>
                    <span title="negated context" className="inline-flex items-center gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--quiet)" }} />
                      {d.counts.negated}
                    </span>
                  </span>
                </td>
                <td><StatusLabel status={d.status} /></td>
                <td className="whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-2">
                    <Link href={`/workbench/${d.id}`} className="btn btn-secondary btn-sm">Open</Link>
                    <a href={d.enrichedPdf} target="_blank" className="btn btn-ghost btn-sm">PDF ↗</a>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="meta py-16 text-center">No documents match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
