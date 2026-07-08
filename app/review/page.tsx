"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DocFindings, DocMeta, Finding, getFindings, getManifest, Manifest, pct,
} from "@/lib/demo";
import { ConfBar, RoutingChip } from "@/components/ui";

interface QueueItem { doc: DocMeta; f: Finding; key: string }

export default function ReviewQueue() {
  const [m, setM] = useState<Manifest | null>(null);
  const [all, setAll] = useState<QueueItem[]>([]);
  const [done, setDone] = useState<Record<string, "approved" | "corrected" | "escalated">>({});

  useEffect(() => {
    (async () => {
      const man = await getManifest();
      setM(man);
      const items: QueueItem[] = [];
      for (const doc of man.documents) {
        const data: DocFindings = await getFindings(doc);
        data.findings.forEach((f, i) => {
          if (f.routing === "review" || f.routing === "escalated") {
            items.push({ doc, f, key: `${doc.id}:${i}` });
          }
        });
      }
      items.sort((a, b) => a.f.confidence - b.f.confidence);
      setAll(items);
    })();
  }, []);

  const remaining = useMemo(() => all.filter((i) => !done[i.key]), [all, done]);

  if (!m) return <div className="p-8 text-muted">Loading…</div>;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-[16px] font-bold" style={{ color: "var(--sw-navy-ink)" }}>
          Human Review Queue
        </h1>
        <span className="chip chip-review">{remaining.length} awaiting judgment</span>
        <span className="chip chip-auto">{Object.keys(done).length} resolved this session</span>
        <span className="text-[11.5px] text-muted ml-auto">
          Sorted lowest-confidence first · reviewers see only what needs judgment
        </span>
      </div>

      <div className="panel overflow-x-auto">
        <table className="sw-table">
          <thead>
            <tr>
              <th>Finding</th><th>Document / Page</th><th>Evidence</th>
              <th>Why Flagged</th><th>Confidence</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {all.map(({ doc, f, key }) => (
              <tr key={key} style={done[key] ? { opacity: 0.45 } : undefined}>
                <td>
                  <div className="font-semibold" style={{ color: "var(--sw-navy-ink)" }}>{f.term_label}</div>
                  <div className="text-[11px] text-muted">{f.category_label} · matched “{f.variant}”</div>
                  <RoutingChip routing={f.routing} />
                </td>
                <td>
                  <Link href={`/workbench/${doc.id}`} className="hover:underline font-medium"
                    style={{ color: "var(--sw-navy)" }}>{doc.docType}</Link>
                  <div className="text-[11px] text-muted">page {f.page} · {f.source === "ocr" ? "OCR page" : "text layer"}</div>
                </td>
                <td className="max-w-[320px]"><span className="italic text-[12px]">…{f.evidence}…</span></td>
                <td className="text-[11.5px] text-muted max-w-[200px]">
                  {f.source === "ocr"
                    ? `OCR word confidence ${pct(f.ocr_conf)} below auto-accept gate`
                    : f.match_quality < 1
                      ? `Fuzzy match quality ${pct(f.match_quality)}`
                      : "Compound confidence below threshold"}
                </td>
                <td><ConfBar value={f.confidence} routing={f.routing} /></td>
                <td className="whitespace-nowrap">
                  {done[key] ? (
                    <span className="chip chip-auto">{done[key]}</span>
                  ) : (
                    <span className="flex gap-1">
                      <button className="btn btn-primary !py-[3px]"
                        onClick={() => setDone((d) => ({ ...d, [key]: "approved" }))}>Approve</button>
                      <button className="btn btn-outline !py-[3px]"
                        onClick={() => setDone((d) => ({ ...d, [key]: "corrected" }))}>Correct</button>
                      <button className="btn btn-ghost !py-[3px]"
                        onClick={() => setDone((d) => ({ ...d, [key]: "escalated" }))}>Escalate</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {all.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-10">Queue empty — all findings auto-accepted.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted">
        Approvals and corrections are session-local in this prototype; the production build persists them to the
        findings store and feeds the taxonomy/threshold tuning loop.
      </p>
    </div>
  );
}
