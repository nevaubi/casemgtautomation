"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getManifest, Manifest } from "@/lib/demo";
import { StatusChip } from "@/components/ui";

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

  if (!m) return <div className="p-8 text-muted">Loading…</div>;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[16px] font-bold" style={{ color: "var(--sw-navy-ink)" }}>Litify Sync</h1>
        <span className="chip chip-neutral">SIMULATED CONNECTION</span>
        <span className="text-[11.5px] text-muted">
          Same payload shapes as production Salesforce REST — swap the connector, keep the platform.
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="panel">
          <div className="panel-h">Connection</div>
          <table className="sw-table">
            <tbody>
              {[
                ["Org", "seegerweiss--uat.sandbox.my.salesforce.com (mock)"],
                ["Auth", "Connected App · OAuth 2.0 JWT bearer (simulated)"],
                ["Integration user", "svc-case-automation@demo"],
                ["API version", "v60.0"],
                ["Matter object", "litify_pm__Matter__c (adjustable schema)"],
                ["Health", "OK · 12 ms round-trip (mock)"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="font-semibold w-[130px]" style={{ color: "var(--sw-navy-ink)" }}>{k}</td>
                  <td className="text-[12px]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel lg:col-span-2">
          <div className="panel-h">Inbound Pull Log (ContentDocumentLink → ContentVersion)</div>
          <div className="overflow-x-auto">
            <table className="sw-table">
              <thead>
                <tr><th>SOQL</th><th>Result</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-mono text-[10.5px] leading-4">
                    SELECT ContentDocumentId FROM ContentDocumentLink<br />
                    WHERE LinkedEntityId = &apos;{m.matter.id}&apos;
                  </td>
                  <td className="text-[12px]">{m.documents.length} linked files</td>
                </tr>
                {m.documents.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-[10.5px] leading-4">
                      GET /sobjects/ContentVersion/{d.sfContentVersionId}/VersionData
                    </td>
                    <td className="text-[12px]">{d.title} — downloaded, sha256 recorded</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Write-Back Staging — nothing pushes without explicit approval</div>
        <div className="overflow-x-auto">
          <table className="sw-table">
            <thead>
              <tr>
                <th>Artifact</th><th>Write-back plan</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {m.documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="font-semibold" style={{ color: "var(--sw-navy-ink)" }}>
                      AI Reviewed — {d.title}
                    </div>
                    <div className="text-[11px] text-muted">
                      original preserved unchanged · enriched uploaded as new ContentVersion
                    </div>
                  </td>
                  <td className="text-[11.5px] leading-5">
                    1. POST /sobjects/ContentVersion (base64 enriched PDF)<br />
                    2. POST /sobjects/ContentDocumentLink → {m.matter.id}<br />
                    3. PATCH extracted fields (adjustable schema)<br />
                    4. POST Task: &ldquo;AI medical record review completed — {d.counts.total} findings&rdquo;
                  </td>
                  <td>
                    {pushed[d.id]
                      ? <span className="chip chip-auto">Written back (simulated)</span>
                      : staged[d.id]
                        ? <span className="chip chip-review">Staged — awaiting approval</span>
                        : <StatusChip status={d.status} />}
                  </td>
                  <td className="whitespace-nowrap">
                    {!staged[d.id] && !pushed[d.id] && (
                      <button className="btn btn-outline !py-[3px]"
                        onClick={() => setStaged((s) => ({ ...s, [d.id]: true }))}>Stage</button>
                    )}
                    {staged[d.id] && !pushed[d.id] && (
                      <button className="btn btn-primary !py-[3px]"
                        onClick={() => setPushed((p) => ({ ...p, [d.id]: true }))}>Approve &amp; Push</button>
                    )}
                    {pushed[d.id] && <span className="text-[11px] text-muted">audit event logged</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted px-3 py-2">
          Simulation contract: identical envelopes to Salesforce REST (query envelope, ContentVersion insert,
          ContentDocumentLink insert). See <code>/api/litify/query</code> in this deployment.
        </p>
      </div>
    </div>
  );
}

export default function LitifySync() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading…</div>}>
      <LitifySyncInner />
    </Suspense>
  );
}
