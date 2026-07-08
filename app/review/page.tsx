"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, DotLabel, PageHeader, RoutingLabel } from "@/components/ui";

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

  if (!m) return <div className="py-32 text-center meta">Loading…</div>;

  return (
    <div className="space-y-10">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Review queue"
        description="Findings the pipeline wasn’t confident enough to accept, lowest confidence first. Decisions persist to the findings store and feed threshold tuning."
      >
        <DotLabel color="var(--warn)" strong>{remaining.length} awaiting</DotLabel>
        <DotLabel color="var(--ok)" strong>{resolved.length} resolved</DotLabel>
      </PageHeader>

      <div className="space-y-5">
        {all.map((item) => {
          const { doc, f, key } = item;
          return (
            <article
              key={key}
              className="card-rest p-6"
              style={f.decision ? { opacity: 0.55 } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
                <div className="min-w-0 max-w-[52ch]">
                  <h3 className="text-lg leading-snug" style={{ color: "var(--black)" }}>
                    {f.term_label}
                  </h3>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--gray-500)" }}>
                    Matched “{f.variant}” — compound confidence {pct(f.confidence)} (match{" "}
                    {pct(f.match_quality)} × OCR {pct(f.ocr_conf)}
                    {f.source === "ocr" ? ", scanned page" : ""})
                  </p>
                  <p
                    className="mt-3 border-l-2 pl-4 text-[13.5px] italic leading-6"
                    style={{ color: "var(--gray-600)", borderColor: "var(--gray-200)" }}
                  >
                    …{f.evidence}…
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <ConfMeter value={f.confidence} routing={f.routing} />
                  {f.decision ? (
                    <span className="meta" style={{ color: "var(--brand-bright)" }}>
                      ✓ {f.decision}
                      {f.decided_by ? ` · ${f.decided_by}` : ""}
                    </span>
                  ) : saving === key ? (
                    <span className="meta">saving…</span>
                  ) : (
                    <span className="flex gap-2">
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
                </div>
              </div>
              <div
                className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                style={{ borderColor: "var(--gray-100)" }}
              >
                <span className="flex items-center gap-5">
                  <RoutingLabel routing={f.routing} />
                  <Link href={`/workbench/${doc.id}`} className="link meta relative z-20">
                    {doc.docType.toLowerCase()} → p.{f.page}
                  </Link>
                </span>
                <span className="meta">{f.source === "ocr" ? "ocr source" : "text layer"}</span>
              </div>
            </article>
          );
        })}
        {all.length === 0 && (
          <div className="card-rest meta py-16 text-center">
            Queue is empty — every finding cleared the auto-accept threshold.
          </div>
        )}
      </div>
    </div>
  );
}
