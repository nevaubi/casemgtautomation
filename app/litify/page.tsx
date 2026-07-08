"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { DotLabel, PageHeader, StatusLabel } from "@/components/ui";

function LitifySyncInner() {
  const [m, setM] = useState<Manifest | null>(null);
  const [staged, setStaged] = useState<Record<string, boolean>>({});
  const [pushed, setPushed] = useState<Record<string, boolean>>({});
  const params = useSearchParams();
  const preStage = params.get("stage");

  useEffect(() => {
    getManifest().then((man) => {
      setM(man);
      if (preStage) setStaged((s) => ({ ...s, [preStage]: true }));
    });
  }, [preStage]);

  if (!m) return <div className="py-32 text-center meta">Loading…</div>;

  return (
    <div className="space-y-12">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Litify sync"
        description="Simulated connection using the same payload shapes as production Salesforce REST — swap the connector, keep the platform."
      >
        <DotLabel color="var(--warn)" strong>simulated environment</DotLabel>
      </PageHeader>

      <div className="grid gap-12 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="mb-6 text-xl" style={{ color: "var(--black)" }}>Connection</h2>
          <div style={{ borderTop: "1px solid var(--gray-200)" }}>
            {[
              ["org", "seegerweiss--uat.sandbox.my.salesforce.com"],
              ["auth", "Connected App · OAuth 2.0 JWT bearer"],
              ["integration user", "svc-case-automation@demo"],
              ["api version", "v60.0"],
              ["matter object", "litify_pm__Matter__c (adjustable schema)"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-6 py-3.5"
                style={{ borderBottom: "1px solid var(--gray-100)" }}
              >
                <span className="meta-label">{k}</span>
                <span className="text-right text-[13px]" style={{ color: "var(--black)" }}>{v}</span>
              </div>
            ))}
            <div
              className="flex items-baseline justify-between gap-6 py-3.5"
              style={{ borderBottom: "1px solid var(--gray-100)" }}
            >
              <span className="meta-label">health</span>
              <DotLabel color="var(--ok)" strong>ok · 12 ms</DotLabel>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl" style={{ color: "var(--black)" }}>Inbound pull log</h2>
            <span className="meta hidden sm:block">
              ContentDocumentLink → ContentVersion → VersionData
            </span>
          </div>
          <div className="space-y-4">
            <div className="mono-block">
              SELECT ContentDocumentId FROM ContentDocumentLink{"\n"}
              WHERE LinkedEntityId = &apos;{m.matter.id}&apos;
              <span style={{ color: "var(--ok)" }}>  → {m.documents.length} linked files</span>
            </div>
            {m.documents.map((d) => (
              <div key={d.id} className="mono-block">
                GET /sobjects/ContentVersion/{d.sfContentVersionId}/VersionData
                <span style={{ color: "var(--ok)" }}>  → 200</span>
                {"\n"}<span style={{ color: "var(--gray-400)" }}>{d.title} · sha256 recorded</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xl" style={{ color: "var(--black)" }}>Write-back staging</h2>
        </div>
        <p className="mb-6 text-[13px]" style={{ color: "var(--gray-500)" }}>
          Originals are never modified. Nothing pushes without explicit approval.
        </p>
        <div className="space-y-5">
          {m.documents.map((d) => (
            <article key={d.id} className="card-rest p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                <div className="min-w-0 max-w-[52ch]">
                  <h3 className="text-lg leading-snug" style={{ color: "var(--black)" }}>
                    AI Reviewed — {d.title}
                  </h3>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--gray-500)" }}>
                    Enriched copy uploads as a new ContentVersion; {d.counts.total} findings attached.
                  </p>
                  <div className="mono-block mt-4 !bg-white">
                    1 POST /sobjects/ContentVersion        <span style={{ color: "var(--gray-400)" }}>enriched pdf</span>{"\n"}
                    2 POST /sobjects/ContentDocumentLink   <span style={{ color: "var(--gray-400)" }}>link to matter</span>{"\n"}
                    3 PATCH extracted fields               <span style={{ color: "var(--gray-400)" }}>adjustable schema</span>{"\n"}
                    4 POST Task                            <span style={{ color: "var(--gray-400)" }}>review-complete notice</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-4">
                  {pushed[d.id] ? (
                    <DotLabel color="var(--ok)" strong>pushed (simulated)</DotLabel>
                  ) : staged[d.id] ? (
                    <DotLabel color="var(--warn)" strong>staged — awaiting approval</DotLabel>
                  ) : (
                    <StatusLabel status={d.status} />
                  )}
                  {!staged[d.id] && !pushed[d.id] && (
                    <button className="btn btn-secondary"
                      onClick={() => setStaged((s) => ({ ...s, [d.id]: true }))}>
                      Stage
                    </button>
                  )}
                  {staged[d.id] && !pushed[d.id] && (
                    <button className="btn btn-primary"
                      onClick={() => {
                        setPushed((p) => ({ ...p, [d.id]: true }));
                        logAuditEvent("litify.writeback", d.id,
                          `Enriched ContentVersion staged and approved for push (simulated) — ${d.counts.total} findings`);
                      }}>
                      Approve and push
                    </button>
                  )}
                  {pushed[d.id] && <span className="meta">audit event logged</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LitifySync() {
  return (
    <Suspense fallback={<div className="py-32 text-center meta">Loading…</div>}>
      <LitifySyncInner />
    </Suspense>
  );
}
