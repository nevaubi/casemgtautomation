"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, RoutingLabel, StatusLabel } from "@/components/ui";

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

  if (!m || !doc || !findings) return <div className="py-32 text-center meta">Loading…</div>;

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
    <div className="space-y-8">
      {/* Document header */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="meta-label mb-2">
            {m.matter.name} · {m.matter.litifyMatterNumber}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h1 className="text-2xl leading-tight" style={{ color: "var(--black)" }}>
              {doc.title}
            </h1>
            <StatusLabel status={doc.status} />
          </div>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--gray-500)" }}>
            {doc.pages} pages · {doc.ocrPages > 0
              ? `${doc.ocrPages} OCR page${doc.ocrPages > 1 ? "s" : ""} · mean confidence ${pct(doc.meanOcrConf)}`
              : "full text layer"} · processed in {doc.processingSeconds}s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <span className="meta tabular-nums" style={{ color: "var(--black)" }}>
            {decided}/{findings.length} reviewed
          </span>
          <a href={doc.enrichedPdf} target="_blank" className="btn btn-secondary">Open PDF ↗</a>
          <Link href={`/litify?stage=${doc.id}`} className="btn btn-primary">Stage write-back</Link>
        </div>
      </div>

      <div className="grid gap-6 xl:[grid-template-columns:220px_minmax(0,1fr)_420px]">
        {/* Matter rail */}
        <div className="self-start">
          <div className="meta-label mb-4">In this matter</div>
          <div style={{ borderTop: "1px solid var(--gray-200)" }}>
            {m.documents.map((d) => {
              const on = d.id === doc.id;
              return (
                <Link
                  key={d.id}
                  href={`/workbench/${d.id}`}
                  className="block py-3.5 transition-colors"
                  style={{ borderBottom: "1px solid var(--gray-100)" }}
                >
                  <div
                    className="text-[13.5px] font-medium leading-snug"
                    style={{
                      color: on ? "var(--black)" : "var(--gray-500)",
                      textDecoration: on ? "underline" : "none",
                      textUnderlineOffset: 4,
                    }}
                  >
                    {d.docType}
                  </div>
                  <div className="meta mt-1">{d.pages} pp · {d.counts.total} findings</div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* PDF viewer */}
        <div className="card flex flex-col overflow-hidden" style={{ height: "76vh" }}>
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--gray-200)" }}
          >
            <span className="meta-label">Enriched document</span>
            <span className="flex items-center gap-4">
              <span className="meta tabular-nums">page {page} / {doc.pages}</span>
              <span className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ← prev
                </button>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => setPage((p) => Math.min(doc.pages, p + 1))}>
                  next →
                </button>
              </span>
            </span>
          </div>
          <iframe
            key={page}
            src={`${doc.enrichedPdf}#page=${page}&zoom=page-width`}
            className="w-full flex-1"
            style={{ background: "var(--gray-100)" }}
            title="Enriched PDF"
          />
        </div>

        {/* Findings panel */}
        <div className="card flex flex-col self-start overflow-hidden" style={{ maxHeight: "76vh" }}>
          <div className="tabs">
            {(["findings", "bookmarks", "fields"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "findings" ? `findings (${findings.length})` : t}
              </button>
            ))}
          </div>

          {tab === "findings" && (
            <>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--gray-200)" }}>
                <div className="seg">
                  {ROUTING_FILTERS.map((r) => (
                    <button key={r} className={routingFilter === r ? "on" : ""}
                      onClick={() => setRoutingFilter(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-y-auto">
                {grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div
                      className="meta-label sticky top-0 px-5 py-2.5"
                      style={{ background: "var(--gray-50)", borderBottom: "1px solid var(--gray-100)" }}
                    >
                      {cat} · {items.length}
                    </div>
                    {items.map((f) => (
                      <div key={f.idx} className="px-5 py-4"
                        style={{ borderBottom: "1px solid var(--gray-100)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <button onClick={() => setPage(f.page)}
                            className="link text-left text-[14px] font-medium"
                            style={{ color: "var(--black)" }}>
                            {f.term_label}
                          </button>
                          <ConfMeter value={f.confidence} routing={f.routing} />
                        </div>
                        <p className="mt-1.5 truncate text-[13px] leading-6"
                          style={{ color: "var(--gray-500)" }} title={f.evidence}>
                          “…{f.evidence}…”
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-4">
                            <RoutingLabel routing={f.routing} />
                            <button onClick={() => setPage(f.page)} className="meta link tabular-nums">
                              p.{f.page}
                            </button>
                            <span className="meta hidden 2xl:inline">
                              {f.source === "ocr" ? `ocr ${pct(f.ocr_conf)}` : "text layer"}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            {saving === f.idx ? (
                              <span className="meta">saving…</span>
                            ) : f.decision ? (
                              <span className="meta" style={{ color: "var(--brand-bright)" }}>
                                ✓ {f.decision}
                              </span>
                            ) : null}
                            <button onClick={() => decide(f, "approved")}
                              className={`btn btn-sm ${f.decision === "approved" ? "btn-primary" : "btn-secondary"}`}>
                              Validate
                            </button>
                            <button onClick={() => decide(f, "rejected")}
                              className={`btn btn-sm ${f.decision === "rejected" ? "btn-primary" : "btn-ghost"}`}>
                              Reject
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && (
                  <div className="meta px-5 py-14 text-center">No findings match this filter.</div>
                )}
              </div>
            </>
          )}

          {tab === "bookmarks" && (
            <div className="overflow-y-auto px-5 py-4">
              {[...new Set(findings.filter((f) => !f.negated).map((f) => f.category_label))].map((cat) => (
                <div key={cat} className="mb-5">
                  <div className="meta-label mb-2">{cat}</div>
                  {[...new Set(
                    findings.filter((f) => !f.negated && f.category_label === cat).map((f) => f.term_label)
                  )].map((term) => {
                    const hits = findings.filter((f) => !f.negated && f.term_label === term);
                    return (
                      <div key={term} className="mb-2.5">
                        <div className="text-[13.5px] font-medium" style={{ color: "var(--black)" }}>
                          {term} <span className="meta">· {hits.length}</span>
                        </div>
                        {[...new Set(hits.map((h) => h.page))].map((p) => (
                          <button key={p} onClick={() => setPage(p)}
                            className="link meta block max-w-full truncate py-0.5 pl-4 text-left">
                            p.{p} — {hits.find((h) => h.page === p)!.evidence.slice(0, 52)}…
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="meta mt-3" style={{ color: "var(--gray-400)" }}>
                Mirrors the outline embedded in the enriched PDF.
              </p>
            </div>
          )}

          {tab === "fields" && (
            <div className="overflow-y-auto">
              <table className="table">
                <thead>
                  <tr><th>target field</th><th>extracted value</th></tr>
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
                      <td className="meta !py-3.5" style={{ color: "var(--brand)" }}>{k}</td>
                      <td className="!py-3.5 text-[13px]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="meta px-6 py-4" style={{ color: "var(--gray-400)" }}>
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
