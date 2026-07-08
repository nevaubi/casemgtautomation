"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { PageHeader, StatusBadge } from "@/components/ui";

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

  if (!m) return <div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>;

  return (
    <div className="grid gap-5">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Litify sync"
        description="Simulated connection using the same payload shapes as production Salesforce REST — swap the connector, keep the platform."
      >
        <span className="badge badge-outline">
          <span className="dot" style={{ background: "var(--warn)" }} />
          Simulated environment
        </span>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="card lg:col-span-2 self-start">
          <div className="card-h"><div className="card-title">Connection</div></div>
          <div className="grid gap-3 px-5 py-4 text-[12.5px]">
            {[
              ["Org", "seegerweiss--uat.sandbox.my.salesforce.com"],
              ["Auth", "Connected App · OAuth 2.0 JWT bearer"],
              ["Integration user", "svc-case-automation@demo"],
              ["API version", "v60.0"],
              ["Matter object", "litify_pm__Matter__c (adjustable schema)"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <span style={{ color: "var(--muted)" }}>{k}</span>
                <span className="text-right font-medium" style={{ color: "var(--ink)" }}>{v}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4">
              <span style={{ color: "var(--muted)" }}>Health</span>
              <span className="badge badge-ok"><span className="dot" />OK · 12 ms</span>
            </div>
          </div>
        </div>

        <div className="card lg:col-span-3 self-start overflow-hidden">
          <div className="card-h">
            <div className="card-title">Inbound pull log</div>
            <div className="card-sub">ContentDocumentLink → ContentVersion → VersionData</div>
          </div>
          <div className="grid gap-3 px-5 py-4">
            <div className="mono-block">
              SELECT ContentDocumentId FROM ContentDocumentLink{"\n"}
              WHERE LinkedEntityId = &apos;{m.matter.id}&apos;
              <span style={{ color: "var(--ok)" }}>  → {m.documents.length} linked files</span>
            </div>
            {m.documents.map((d) => (
              <div key={d.id} className="mono-block">
                GET /sobjects/ContentVersion/{d.sfContentVersionId}/VersionData
                <span style={{ color: "var(--ok)" }}>  → 200 · sha256 recorded</span>
                {"\n"}<span style={{ color: "var(--faint)" }}>{d.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-h">
          <div>
            <div className="card-title">Write-back staging</div>
            <div className="card-sub">
              Originals are never modified. Nothing pushes without explicit approval.
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Write-back plan</th>
                <th>Status</th>
                <th className="!text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {m.documents.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-[300px]">
                    <div className="font-medium" style={{ color: "var(--ink)" }}>
                      AI Reviewed — {d.title}
                    </div>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
                      Enriched copy uploads as a new ContentVersion; {d.counts.total} findings attached.
                    </div>
                  </td>
                  <td>
                    <ol className="grid gap-1 text-[12px]" style={{ color: "var(--muted)" }}>
                      <li><span className="mono" style={{ color: "var(--text)" }}>POST /sobjects/ContentVersion</span> — enriched PDF</li>
                      <li><span className="mono" style={{ color: "var(--text)" }}>POST /sobjects/ContentDocumentLink</span> — link to matter</li>
                      <li><span className="mono" style={{ color: "var(--text)" }}>PATCH</span> extracted fields (adjustable schema)</li>
                      <li><span className="mono" style={{ color: "var(--text)" }}>POST Task</span> — review-complete notification</li>
                    </ol>
                  </td>
                  <td className="whitespace-nowrap">
                    {pushed[d.id] ? (
                      <span className="badge badge-ok"><span className="dot" />Pushed (simulated)</span>
                    ) : staged[d.id] ? (
                      <span className="badge badge-warn"><span className="dot" />Staged — awaiting approval</span>
                    ) : (
                      <StatusBadge status={d.status} />
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {!staged[d.id] && !pushed[d.id] && (
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => setStaged((s) => ({ ...s, [d.id]: true }))}>
                        Stage
                      </button>
                    )}
                    {staged[d.id] && !pushed[d.id] && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => {
                          setPushed((p) => ({ ...p, [d.id]: true }));
                          logAuditEvent("litify.writeback", d.id,
                            `Enriched ContentVersion staged and approved for push (simulated) — ${d.counts.total} findings`);
                        }}>
                        Approve and push
                      </button>
                    )}
                    {pushed[d.id] && (
                      <span className="text-[12px]" style={{ color: "var(--faint)" }}>Audit event logged</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function LitifySync() {
  return (
    <Suspense fallback={<div className="py-24 text-center" style={{ color: "var(--faint)" }}>Loading…</div>}>
      <LitifySyncInner />
    </Suspense>
  );
}
