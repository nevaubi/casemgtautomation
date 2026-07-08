"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfBar, RoutingChip } from "@/components/ui";

interface QueueItem { doc: DocMeta; f: Finding; key: string }

export default function ReviewQueue() {
  const [m, setM] = useState<Manifest | null>(null);
  const [all, setAll] = useState<QueueItem[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const man = await getManifest();
      setM(man);
      const items: QueueItem[] = [];
      for (const doc of man.documents) {
        const findings = await loadDocFindings(doc);
        for (const f of findings) {
          if (f.routing === "review" || f.routing === "escalated") {
            items.push({ doc, f, key: `${doc.id}:${f.idx}` });
          }
        }
      }
      items.sort((a, b) => a.f.confidence - b.f.confidence);
      setAll(items);
    })();
  }, []);

  const remaining = useMemo(() => all.filter((i) => !i.f.decision), [all]);
  const resolved = useMemo(() => all.filter((i) => i.f.decision), [all]);

  const act = async (item: QueueItem, decision: Exclude<Decision, null>) => {
    setSaving(item.key);
    setAll((prev) =>
      prev.map((x) => (x.key === item.key ? { ...x, f: { ...x.f, decision } } : x))
    );
    await recordDecision(item.doc.id, item.f.idx, decision);
    setSaving(null);
  };

  if (!m) return <div className="p-8 text-muted">Loading…</div>;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-[16px] font-bold" style={{ color: "var(--sw-navy-ink)" }}>
          Human Review Queue
        </h1>
        <span className="chip chip-review">{remaining.length} awaiting judgment</span>
        <span className="chip chip-auto">{resolved.length} resolved</span>
        <span className="text-[11.5px] text-muted ml-auto">
          Sorted lowest-confidence first · decisions persist to the findings store
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
            {all.map((item) => {
              const { doc, f, key } = item;
              return (
                <tr key={key} style={f.decision ? { opacity: 0.45 } : undefined}>
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
                    {f.decision ? (
                      <span className="chip chip-auto">
                        {f.decision}{f.decided_by ? ` · ${f.decided_by}` : ""}
                      </span>
                    ) : saving === key ? (
                      <span className="text-[11px] text-muted">saving…</span>
                    ) : (
                      <span className="flex gap-1">
                        <button className="btn btn-primary !py-[3px]" onClick={() => act(item, "approved")}>Approve</button>
                        <button className="btn btn-outline !py-[3px]" onClick={() => act(item, "corrected")}>Correct</button>
                        <button className="btn btn-ghost !py-[3px]" onClick={() => act(item, "escalated")}>Escalate</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {all.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-10">Queue empty — all findings auto-accepted.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted">
        Decisions are written to the Supabase findings store with an audit event and reload across sessions.
        They feed the taxonomy/threshold tuning loop in later phases.
      </p>
    </div>
  );
}
