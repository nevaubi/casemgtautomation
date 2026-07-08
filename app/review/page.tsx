"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, PageHeader, RoutingBadge } from "@/components/ui";

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

  if (!m) return <div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>;

  return (
    <div className="grid gap-5">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Review queue"
        description="Findings the pipeline wasn’t confident enough to accept, lowest confidence first. Decisions persist and feed threshold tuning."
      >
        <span className="badge badge-warn"><span className="dot" />{remaining.length} awaiting</span>
        <span className="badge badge-ok"><span className="dot" />{resolved.length} resolved</span>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Location</th>
                <th>Evidence</th>
                <th>Confidence</th>
                <th className="!text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {all.map((item) => {
                const { doc, f, key } = item;
                const why = `Compound confidence ${pct(f.confidence)} — match ${pct(
                  f.match_quality
                )} × OCR ${pct(f.ocr_conf)}${f.source === "ocr" ? ", scanned page" : ""}`;
                return (
                  <tr key={key} style={f.decision ? { opacity: 0.5 } : undefined}>
                    <td className="max-w-[280px]">
                      <div className="font-medium" style={{ color: "var(--ink)" }}>{f.term_label}</div>
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
                        Matched “{f.variant}” · {why}
                      </div>
                      <div className="mt-1.5"><RoutingBadge routing={f.routing} /></div>
                    </td>
                    <td className="whitespace-nowrap">
                      <Link
                        href={`/workbench/${doc.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--brand)" }}
                      >
                        {doc.docType}
                      </Link>
                      <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                        Page {f.page} · {f.source === "ocr" ? "OCR" : "text layer"}
                      </div>
                    </td>
                    <td className="max-w-[300px]">
                      <span className="text-[12.5px] italic leading-5" style={{ color: "var(--muted)" }}>
                        …{f.evidence}…
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <ConfMeter value={f.confidence} routing={f.routing} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {f.decision ? (
                        <span className="badge badge-brand">
                          <span className="dot" />
                          {f.decision}
                        </span>
                      ) : saving === key ? (
                        <span className="text-[12px]" style={{ color: "var(--faint)" }}>Saving…</span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button className="btn btn-primary btn-sm" onClick={() => act(item, "approved")}>
                            Approve
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => act(item, "corrected")}>
                            Correct
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => act(item, "escalated")}>
                            Escalate
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {all.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-14 text-center" style={{ color: "var(--faint)" }}>
                    Queue is empty — every finding cleared the auto-accept threshold.
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
