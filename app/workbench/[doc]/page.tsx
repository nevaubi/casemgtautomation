"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfBar, RoutingChip, StatusChip } from "@/components/ui";

type Tab = "findings" | "bookmarks" | "fields";

export default function Workbench({ params }: { params: Promise<{ doc: string }> }) {
  const { doc: docId } = use(params);
  const [m, setM] = useState<Manifest | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [tab, setTab] = useState<Tab>("findings");
  const [page, setPage] = useState(1);
  const [routingFilter, setRoutingFilter] = useState<string>("all");
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

  if (!m || !doc || !findings) return <div className="p-8 text-muted">Loading…</div>;

  const decide = async (f: Finding, decision: "approved" | "rejected") => {
    const next: Decision = f.decision === decision ? null : decision;
    // optimistic update; persistence via Supabase (toggle-off stays local)
    setFindings((prev) =>
      prev!.map((x) => (x.idx === f.idx ? { ...x, decision: next } : x))
    );
    if (next) {
      setSaving(f.idx);
      await recordDecision(doc.id, f.idx, next);
      setSaving(null);
    }
  };

  const decidedCount = findings.filter((f) => f.decision).length;

  return (
    <div className="grid gap-3">
      {/* Header */}
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="min-w-0">
          <div className="font-bold truncate" style={{ color: "var(--sw-navy-ink)" }}>{doc.title}</div>
          <div className="text-[11px] text-muted">
            {m.matter.name} · {m.matter.litifyMatterNumber} · {doc.pages} pages ·{" "}
            {doc.ocrPages > 0 ? `${doc.ocrPages} OCR pages · mean conf ${pct(doc.meanOcrConf)}` : "full text layer"}
          </div>
        </div>
        <StatusChip status={doc.status} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {decidedCount}/{findings.length} reviewed · persisted
          </span>
          <a href={doc.enrichedPdf} target="_blank" className="btn btn-ghost">Open Enriched PDF ↗</a>
          <Link href={`/litify?stage=${doc.id}`} className="btn btn-primary">Stage Write-Back</Link>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "180px minmax(0,1fr) 430px" }}>
        {/* Left rail */}
        <div className="panel self-start">
          <div className="panel-h">Documents</div>
          <div className="p-1.5 grid gap-1">
            {m.documents.map((d) => (
              <Link key={d.id} href={`/workbench/${d.id}`}
                className="rounded px-2 py-2 text-[11.5px] leading-4 hover:bg-mist"
                style={d.id === doc.id
                  ? { background: "var(--sw-mist)", borderLeft: "3px solid var(--sw-navy)" }
                  : { borderLeft: "3px solid transparent" }}>
                <div className="font-semibold" style={{ color: "var(--sw-navy-ink)" }}>{d.docType}</div>
                <div className="text-muted">{d.pages} pp · {d.counts.total} findings</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Center: PDF viewer */}
        <div className="panel flex flex-col" style={{ height: "78vh" }}>
          <div className="panel-h">
            <span>Enriched PDF — page {page}</span>
            <span className="flex items-center gap-1 normal-case">
              <button className="btn btn-ghost !py-[2px]" onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <button className="btn btn-ghost !py-[2px]" onClick={() => setPage((p) => Math.min(doc.pages, p + 1))}>Next ›</button>
            </span>
          </div>
          <iframe
            key={page}
            src={`${doc.enrichedPdf}#page=${page}&zoom=page-width`}
            className="w-full flex-1"
            title="Enriched PDF"
          />
        </div>

        {/* Right: tabs */}
        <div className="panel self-start flex flex-col" style={{ maxHeight: "78vh" }}>
          <div className="flex border-b" style={{ borderColor: "var(--sw-border)" }}>
            {(["findings", "bookmarks", "fields"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={tab === t
                  ? { color: "var(--sw-navy)", borderBottom: "2px solid var(--sw-navy)", background: "var(--sw-mist)" }
                  : { color: "var(--sw-muted)" }}>
                {t === "findings" ? `Findings (${findings.length})` : t}
              </button>
            ))}
          </div>

          {tab === "findings" && (
            <>
              <div className="flex gap-1 p-2 border-b flex-wrap" style={{ borderColor: "var(--sw-border)" }}>
                {["all", "auto", "review", "escalated", "negated"].map((r) => (
                  <button key={r} onClick={() => setRoutingFilter(r)}
                    className={`chip ${routingFilter === r ? "chip-neutral" : ""}`}
                    style={routingFilter === r ? { outline: "1.5px solid var(--sw-navy)" } : { background: "var(--sw-bg)", color: "var(--sw-muted)" }}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto">
                {grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider sticky top-0"
                      style={{ background: "var(--sw-mist)", color: "var(--sw-navy-ink)" }}>
                      {cat} · {items.length}
                    </div>
                    {items.map((f) => (
                      <div key={f.idx} className="px-3 py-2.5 border-b" style={{ borderColor: "var(--sw-border)" }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => setPage(f.page)}
                            className="font-semibold text-[12.5px] hover:underline"
                            style={{ color: "var(--sw-navy)" }}>
                            {f.term_label}
                          </button>
                          <RoutingChip routing={f.routing} />
                          <button onClick={() => setPage(f.page)} className="chip chip-neutral">p.{f.page}</button>
                          <span className="ml-auto"><ConfBar value={f.confidence} routing={f.routing} /></span>
                        </div>
                        <div className="text-[11.5px] mt-1 leading-4" style={{ color: "var(--sw-text)" }}>
                          matched <b>&ldquo;{f.variant}&rdquo;</b>
                          <span className="text-muted"> ({f.source === "ocr" ? `OCR ${pct(f.ocr_conf)}` : "text layer"})</span>
                        </div>
                        <div className="text-[11px] italic text-muted mt-0.5 leading-4">…{f.evidence}…</div>
                        <div className="flex gap-1.5 mt-1.5 items-center">
                          <button onClick={() => decide(f, "approved")}
                            className={`btn !py-[2px] !text-[11px] ${f.decision === "approved" ? "btn-primary" : "btn-ghost"}`}>
                            ✓ Validate
                          </button>
                          <button onClick={() => decide(f, "rejected")}
                            className={`btn !py-[2px] !text-[11px] ${f.decision === "rejected" ? "btn-primary" : "btn-ghost"}`}>
                            ✗ Reject
                          </button>
                          {saving === f.idx && <span className="text-[10.5px] text-muted">saving…</span>}
                          {f.decision && saving !== f.idx && (
                            <span className="chip chip-auto">{f.decision}</span>
                          )}
                          {f.routing === "escalated" && (
                            <span className="chip chip-escalated ml-auto">agent second-opinion pending</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "bookmarks" && (
            <div className="overflow-y-auto p-2 text-[12px]">
              {[...new Set(findings.filter((f) => !f.negated).map((f) => f.category_label))].map((cat) => (
                <div key={cat} className="mb-2">
                  <div className="font-bold" style={{ color: "var(--sw-navy-ink)" }}>▾ {cat}</div>
                  {[...new Set(findings.filter((f) => !f.negated && f.category_label === cat).map((f) => f.term_label))].map((term) => {
                    const hits = findings.filter((f) => !f.negated && f.term_label === term);
                    return (
                      <div key={term} className="ml-3">
                        <div className="font-semibold text-[11.5px]">▾ {term} ({hits.length})</div>
                        {[...new Set(hits.map((h) => h.page))].map((p) => (
                          <button key={p} onClick={() => setPage(p)}
                            className="ml-4 block text-left text-[11px] hover:underline py-[1px]"
                            style={{ color: "var(--sw-navy)" }}>
                            p.{p} — {hits.find((h) => h.page === p)!.evidence.slice(0, 44)}…
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="text-[10.5px] text-muted mt-2">
                Mirrors the PDF outline embedded in the enriched file (visible in Acrobat).
              </p>
            </div>
          )}

          {tab === "fields" && (
            <div className="overflow-y-auto">
              <table className="sw-table">
                <thead><tr><th>Target Field (adjustable schema)</th><th>Extracted Value</th></tr></thead>
                <tbody>
                  {[
                    ["litify_pm__Matter__c.Name", m.matter.name],
                    ["Matter Number", m.matter.litifyMatterNumber],
                    ["Primary_Drug__c", "Depo-Provera (medroxyprogesterone acetate)"],
                    ["First_Exposure_Date__c", "2021-04-13"],
                    ["Last_Exposure_Date__c", "2022-07-19"],
                    ["Injection_Count__c", "6 documented administrations"],
                    ["Diagnosis_Code__c", "G93.2 — idiopathic intracranial hypertension"],
                    ["Diagnosis_Confirmed_Date__c", "2022-12-16 (LP, OP 32 cm H2O)"],
                    ["Causation_Language_Present__c", "Yes — neurology consult p.7"],
                    ["Records_Gap_Flag__c", "Deferred dose ~2022-10-18"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="font-mono text-[11px]" style={{ color: "var(--sw-navy)" }}>{k}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10.5px] text-muted p-3">
                Field targets are placeholders in the adjustable schema; remapped to the real Litify org
                describe() output at integration time. Nothing writes back without approval.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
