"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, RoutingBadge, StatusBadge } from "@/components/ui";

type Tab = "findings" | "bookmarks" | "fields";
const ROUTING_FILTERS = ["all", "auto", "review", "escalated", "negated"] as const;

export default function Workbench({ params }: { params: Promise<{ doc: string }> }) {
  const { doc: docId } = use(params);
  const [m, setM] = useState<Manifest | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [tab, setTab] = useState<Tab>("findings");
  const [page, setPage] = useState(1);
  const [routingFilter, setRoutingFilter] =
    useState<(typeof ROUTING_FILTERS)[number]>("all");
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => { getManifest().then(setM); }, []);
  const doc: DocMeta | undefined = m?.documents.find((d) => d.id === docId);
  useEffect(() => {
    if (doc) { setFindings(null); loadDocFindings(doc).then(setFindings); }
  }, [doc]);

  const grouped = useMemo(() => {
    if (!findings) return [];
    const filtered = findings.filter(
      (f) => routingFilter === "all" || f.routing === routingFilter
    );
    const byCat = new Map<string, Finding[]>();
    for (const f of filtered) {
      if (!byCat.has(f.category_label)) byCat.set(f.category_label, []);
      byCat.get(f.category_label)!.push(f);
    }
    return [...byCat.entries()];
  }, [findings, routingFilter]);

  if (!m || !doc || !findings)
    return <div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>;

  const decide = async (f: Finding, decision: "approved" | "rejected") => {
    const next: Decision = f.decision === decision ? null : decision;
    setFindings((prev) => prev!.map((x) => (x.idx === f.idx ? { ...x, decision: next } : x)));
    if (next) {
      setSaving(f.idx);
      await recordDecision(doc.id, f.idx, next);
      setSaving(null);
    }
  };

  const decided = findings.filter((f) => f.decision).length;

  return (
    <div className="grid gap-4">
      {/* Document header */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0">
          <div className="ovl mb-0.5">
            {m.matter.name} · {m.matter.litifyMatterNumber}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="truncate text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
              {doc.title}
            </h1>
            <StatusBadge status={doc.status} />
          </div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--muted)" }}>
            {doc.pages} pages · {doc.ocrPages > 0
              ? `${doc.ocrPages} OCR page${doc.ocrPages > 1 ? "s" : ""} · mean confidence ${pct(doc.meanOcrConf)}`
              : "full text layer"} · processed in {doc.processingSeconds}s
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-[12px] font-medium tabular-nums" style={{ color: "var(--ink)" }}>
              {decided} / {findings.length} reviewed
            </div>
            <div className="mt-1 h-1 w-[120px] rounded-full" style={{ background: "var(--line)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${findings.length ? (decided / findings.length) * 100 : 0}%`,
                  background: "var(--brand)",
                }}
              />
            </div>
          </div>
          <a href={doc.enrichedPdf} target="_blank" className="btn btn-secondary">Open PDF ↗</a>
          <Link href={`/litify?stage=${doc.id}`} className="btn btn-primary">Stage write-back</Link>
        </div>
      </div>

      <div className="grid gap-4 xl:[grid-template-columns:220px_minmax(0,1fr)_400px]">
        {/* Matter documents rail */}
        <div className="card self-start overflow-hidden">
          <div className="card-h"><div className="card-title">In this matter</div></div>
          <div className="py-1.5">
            {m.documents.map((d) => {
              const on = d.id === doc.id;
              return (
                <Link
                  key={d.id}
                  href={`/workbench/${d.id}`}
                  className="relative block px-4 py-2.5 transition-colors"
                  style={on ? { background: "var(--brand-wash)" } : undefined}
                >
                  {on && (
                    <span
                      className="absolute inset-y-1.5 left-0 w-[3px] rounded-r"
                      style={{ background: "var(--brand)" }}
                    />
                  )}
                  <div
                    className="text-[12.5px] font-medium leading-snug"
                    style={{ color: on ? "var(--brand)" : "var(--ink)" }}
                  >
                    {d.docType}
                  </div>
                  <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
                    {d.pages} pages · {d.counts.total} findings
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* PDF viewer */}
        <div className="card flex flex-col overflow-hidden" style={{ height: "76vh" }}>
          <div className="card-h !py-2.5">
            <div className="card-title">Enriched document</div>
            <div className="flex items-center gap-1">
              <span className="mr-2 text-[12px] tabular-nums" style={{ color: "var(--muted)" }}>
                Page {page} of {doc.pages}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ← Prev
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(doc.pages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
          <iframe
            key={page}
            src={`${doc.enrichedPdf}#page=${page}&zoom=page-width`}
            className="w-full flex-1"
            style={{ background: "#40474f" }}
            title="Enriched PDF"
          />
        </div>

        {/* Findings panel */}
        <div className="card flex flex-col self-start overflow-hidden" style={{ maxHeight: "76vh" }}>
          <div className="tabs">
            {(["findings", "bookmarks", "fields"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "findings" ? `Findings · ${findings.length}`
                  : t === "bookmarks" ? "Bookmarks" : "Fields"}
              </button>
            ))}
          </div>

          {tab === "findings" && (
            <>
              <div className="flex flex-wrap gap-1 px-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="seg">
                  {ROUTING_FILTERS.map((r) => (
                    <button
                      key={r}
                      className={routingFilter === r ? "on" : ""}
                      onClick={() => setRoutingFilter(r)}
                      style={{ textTransform: "capitalize" }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-y-auto">
                {grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div
                      className="ovl sticky top-0 px-4 py-2"
                      style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}
                    >
                      {cat} · {items.length}
                    </div>
                    {items.map((f) => (
                      <div
                        key={f.idx}
                        className="px-4 py-3"
                        style={{ borderBottom: "1px solid var(--line)" }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage(f.page)}
                            className="text-[13px] font-medium hover:underline"
                            style={{ color: "var(--ink)" }}
                          >
                            {f.term_label}
                          </button>
                          <button
                            onClick={() => setPage(f.page)}
                            className="text-[12px] tabular-nums hover:underline"
                            style={{ color: "var(--brand)" }}
                          >
                            p.{f.page}
                          </button>
                          <span className="ml-auto"><ConfMeter value={f.confidence} routing={f.routing} /></span>
                        </div>
                        <div className="mt-1 text-[12px] leading-5" style={{ color: "var(--muted)" }}>
                          Matched “{f.variant}” · {f.source === "ocr" ? `OCR ${pct(f.ocr_conf)}` : "text layer"}
                        </div>
                        <div
                          className="mt-0.5 truncate text-[12px] italic leading-5"
                          style={{ color: "var(--faint)" }}
                          title={f.evidence}
                        >
                          …{f.evidence}…
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <RoutingBadge routing={f.routing} />
                          <span className="ml-auto inline-flex items-center gap-1.5">
                            {saving === f.idx ? (
                              <span className="text-[11.5px]" style={{ color: "var(--faint)" }}>Saving…</span>
                            ) : f.decision ? (
                              <span className="badge badge-brand">
                                <span className="dot" />{f.decision}
                              </span>
                            ) : null}
                            <button
                              onClick={() => decide(f, "approved")}
                              className={`btn btn-sm ${f.decision === "approved" ? "btn-primary" : "btn-secondary"}`}
                            >
                              Validate
                            </button>
                            <button
                              onClick={() => decide(f, "rejected")}
                              className={`btn btn-sm ${f.decision === "rejected" ? "btn-primary" : "btn-ghost"}`}
                            >
                              Reject
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && (
                  <div className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--faint)" }}>
                    No findings match this filter.
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "bookmarks" && (
            <div className="overflow-y-auto px-4 py-3">
              {[...new Set(findings.filter((f) => !f.negated).map((f) => f.category_label))].map((cat) => (
                <div key={cat} className="mb-3">
                  <div className="ovl mb-1">{cat}</div>
                  {[...new Set(
                    findings.filter((f) => !f.negated && f.category_label === cat).map((f) => f.term_label)
                  )].map((term) => {
                    const hits = findings.filter((f) => !f.negated && f.term_label === term);
                    return (
                      <div key={term} className="mb-1.5">
                        <div className="text-[12.5px] font-medium" style={{ color: "var(--ink)" }}>
                          {term} <span style={{ color: "var(--faint)" }}>· {hits.length}</span>
                        </div>
                        {[...new Set(hits.map((h) => h.page))].map((p) => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className="block truncate py-[2px] pl-3 text-left text-[12px] hover:underline"
                            style={{ color: "var(--brand)", maxWidth: "100%" }}
                          >
                            p.{p} — {hits.find((h) => h.page === p)!.evidence.slice(0, 52)}…
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--faint)" }}>
                Mirrors the outline embedded in the enriched PDF.
              </p>
            </div>
          )}

          {tab === "fields" && (
            <div className="overflow-y-auto">
              <table className="table">
                <thead>
                  <tr><th>Target field</th><th>Extracted value</th></tr>
                </thead>
                <tbody>
                  {[
                    ["litify_pm__Matter__c.Name", m.matter.name],
                    ["Matter_Number__c", m.matter.litifyMatterNumber],
                    ["Primary_Drug__c", "Depo-Provera (medroxyprogesterone acetate)"],
                    ["First_Exposure_Date__c", "2021-04-13"],
                    ["Last_Exposure_Date__c", "2022-07-19"],
                    ["Injection_Count__c", "6 documented administrations"],
                    ["Diagnosis_Code__c", "G93.2 — idiopathic intracranial hypertension"],
                    ["Diagnosis_Confirmed_Date__c", "2022-12-16 (LP, OP 32 cm H2O)"],
                    ["Causation_Language_Present__c", "Yes — neurology consult, p.7"],
                    ["Records_Gap_Flag__c", "Deferred dose ~2022-10-18"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono !py-3" style={{ color: "var(--brand)" }}>{k}</td>
                      <td className="!py-3 text-[12.5px]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-3 text-[11.5px]" style={{ color: "var(--faint)" }}>
                Placeholder targets in the adjustable schema — remapped to the live org’s describe()
                output at integration time. Nothing writes back without approval.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
