"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { PageHeader, StatusBadge } from "@/components/case-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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

  if (!m) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Litify sync"
        description="Simulated connection using the same payload shapes as production Salesforce REST — swap the connector, keep the platform."
      >
        <Badge variant="outline" className="gap-1.5">
          <span className="bg-status-warn size-1.5 rounded-full" />
          Simulated environment
        </Badge>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="self-start shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Connected App profile used by the connector</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              ["Org", "seegerweiss--uat.sandbox.my.salesforce.com"],
              ["Auth", "Connected App · OAuth 2.0 JWT bearer"],
              ["Integration user", "svc-case-automation@demo"],
              ["API version", "v60.0"],
              ["Matter object", "litify_pm__Matter__c (adjustable schema)"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground">Health</span>
              <Badge variant="outline" className="gap-1.5">
                <span className="bg-status-ok size-1.5 rounded-full" />
                OK · 12 ms
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="self-start shadow-none lg:col-span-3">
          <CardHeader>
            <CardTitle>Inbound pull log</CardTitle>
            <CardDescription>ContentDocumentLink → ContentVersion → VersionData</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <pre className="bg-muted/50 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
              SELECT ContentDocumentId FROM ContentDocumentLink{"\n"}
              WHERE LinkedEntityId = &apos;{m.matter.id}&apos;
              <span className="text-status-ok">  → {m.documents.length} linked files</span>
            </pre>
            {m.documents.map((d) => (
              <pre
                key={d.id}
                className="bg-muted/50 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed"
              >
                GET /sobjects/ContentVersion/{d.sfContentVersionId}/VersionData
                <span className="text-status-ok">  → 200</span>
                {"\n"}<span className="text-muted-foreground">{d.title} · sha256 recorded</span>
              </pre>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 shadow-none">
        <CardHeader>
          <CardTitle>Write-back staging</CardTitle>
          <CardDescription>
            Originals are never modified. Nothing pushes without explicit approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artifact</TableHead>
                <TableHead>Write-back plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-72">
                    <div className="font-medium">AI Reviewed — {d.title}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      Enriched copy uploads as a new ContentVersion; {d.counts.total} findings
                      attached.
                    </div>
                  </TableCell>
                  <TableCell>
                    <ol className="text-muted-foreground grid gap-1 text-xs">
                      <li><span className="text-foreground font-mono">POST /sobjects/ContentVersion</span> — enriched PDF</li>
                      <li><span className="text-foreground font-mono">POST /sobjects/ContentDocumentLink</span> — link to matter</li>
                      <li><span className="text-foreground font-mono">PATCH</span> extracted fields (adjustable schema)</li>
                      <li><span className="text-foreground font-mono">POST Task</span> — review-complete notification</li>
                    </ol>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {pushed[d.id] ? (
                      <Badge variant="outline" className="gap-1.5">
                        <span className="bg-status-ok size-1.5 rounded-full" />
                        Pushed (simulated)
                      </Badge>
                    ) : staged[d.id] ? (
                      <Badge variant="outline" className="gap-1.5">
                        <span className="bg-status-warn size-1.5 rounded-full" />
                        Staged — awaiting approval
                      </Badge>
                    ) : (
                      <StatusBadge status={d.status} />
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {!staged[d.id] && !pushed[d.id] && (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setStaged((s) => ({ ...s, [d.id]: true }))}
                      >
                        Stage
                      </Button>
                    )}
                    {staged[d.id] && !pushed[d.id] && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPushed((p) => ({ ...p, [d.id]: true }));
                          logAuditEvent(
                            "litify.writeback", d.id,
                            `Enriched ContentVersion staged and approved for push (simulated) — ${d.counts.total} findings`
                          );
                        }}
                      >
                        Approve and push
                      </Button>
                    )}
                    {pushed[d.id] && (
                      <span className="text-muted-foreground text-xs">Audit event logged</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LitifySync() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LitifySyncInner />
    </Suspense>
  );
}
