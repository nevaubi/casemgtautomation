"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, UploadCloud } from "lucide-react";

import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { PageHeader, StatusBadge, TintBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function LitifySyncInner() {
  const [m, setM] = useState<Manifest | null>(null);
  const [staged, setStaged] = useState<Record<string, boolean>>({});
  const [pushed, setPushed] = useState<Record<string, boolean>>({});
  const [pushing, setPushing] = useState<string | null>(null);
  const params = useSearchParams();
  const preStage = params.get("stage");

  useEffect(() => {
    getManifest().then((man) => {
      setM(man);
      if (preStage) setStaged((s) => ({ ...s, [preStage]: true }));
    });
  }, [preStage]);

  if (!m) return <Skeleton className="mt-3 h-[80%] w-full" />;

  const push = (id: string, total: number) => {
    setPushing(id);
    logAuditEvent(
      "litify.writeback", id,
      `Enriched ContentVersion staged and approved for push (simulated) — ${total} findings`
    );
    setTimeout(() => {
      setPushed((p) => ({ ...p, [id]: true }));
      setPushing(null);
    }, 700);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Litify sync"
        description="Simulated connection using the same payload shapes as production Salesforce REST — swap the connector, keep the platform."
      >
        <TintBadge tone="amber">Simulated environment</TintBadge>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-1">
        <div className="grid gap-3 lg:grid-cols-5">
          <Card className="gap-0 self-start rounded-lg py-0 shadow-none lg:col-span-2">
            <div className="border-b px-4 py-2.5">
              <span className="text-[13px] font-semibold">Connection</span>
              <span className="text-muted-foreground ml-2 text-[11px]">Connected App profile</span>
            </div>
            <div className="grid gap-2 px-4 py-3 text-sm">
              {[
                ["Org", "seegerweiss--uat.sandbox.my.salesforce.com"],
                ["Auth", "Connected App · OAuth 2.0 JWT bearer"],
                ["Integration user", "svc-case-automation@demo"],
                ["API version", "v60.0"],
                ["Matter object", "litify_pm__Matter__c (adjustable schema)"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <span className="text-muted-foreground text-xs">{k}</span>
                  <span className="truncate text-right text-xs font-medium">{v}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground text-xs">Health</span>
                <TintBadge tone="emerald">OK · 12 ms</TintBadge>
              </div>
            </div>
          </Card>

          <Card className="gap-0 self-start rounded-lg py-0 shadow-none lg:col-span-3">
            <div className="flex items-baseline justify-between border-b px-4 py-2.5">
              <span className="text-[13px] font-semibold">Inbound pull log</span>
              <span className="text-muted-foreground hidden text-[11px] sm:block">
                ContentDocumentLink → ContentVersion → VersionData
              </span>
            </div>
            <div className="grid gap-2 px-4 py-3">
              <pre className="bg-muted/50 overflow-x-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed">
                SELECT ContentDocumentId FROM ContentDocumentLink{"\n"}
                WHERE LinkedEntityId = &apos;{m.matter.id}&apos;
                <span className="text-emerald-700">  → {m.documents.length} linked files</span>
              </pre>
              {m.documents.map((d) => (
                <pre
                  key={d.id}
                  className="bg-muted/50 overflow-x-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed"
                >
                  GET /sobjects/ContentVersion/{d.sfContentVersionId}/VersionData
                  <span className="text-emerald-700">  → 200</span>
                  {"\n"}<span className="text-muted-foreground">{d.title} · sha256 recorded</span>
                </pre>
              ))}
            </div>
          </Card>
        </div>

        <Card className="gap-0 overflow-hidden rounded-lg py-0 shadow-none">
          <div className="flex items-baseline justify-between border-b px-4 py-2.5">
            <span className="text-[13px] font-semibold">Write-back staging</span>
            <span className="text-muted-foreground text-[11px]">
              Originals are never modified · nothing pushes without approval
            </span>
          </div>
          <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 px-4 font-medium">Artifact</TableHead>
                <TableHead className="h-10 px-4 font-medium">Write-back plan</TableHead>
                <TableHead className="h-10 w-[190px] px-4 font-medium">Status</TableHead>
                <TableHead className="h-10 w-[170px] px-4 font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.documents.map((d) => (
                <TableRow key={d.id} className="hover:bg-muted/50">
                  <TableCell className="max-w-[260px] px-4 py-2.5 align-top">
                    <div className="truncate font-medium">AI Reviewed — {d.title}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      New ContentVersion · {d.counts.total} findings attached
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 align-top">
                    <ol className="text-muted-foreground grid gap-0.5 text-[11px]">
                      <li><span className="text-foreground font-mono">POST /sobjects/ContentVersion</span> — enriched PDF</li>
                      <li><span className="text-foreground font-mono">POST /sobjects/ContentDocumentLink</span> — link to matter</li>
                      <li><span className="text-foreground font-mono">PATCH</span> extracted fields · <span className="text-foreground font-mono">POST Task</span> notice</li>
                    </ol>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 align-top whitespace-nowrap">
                    {pushed[d.id] ? (
                      <TintBadge tone="emerald">Pushed (simulated)</TintBadge>
                    ) : staged[d.id] ? (
                      <TintBadge tone="amber">Staged — awaiting approval</TintBadge>
                    ) : (
                      <StatusBadge status={d.status} />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 align-top whitespace-nowrap">
                    {!staged[d.id] && !pushed[d.id] && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                            onClick={() => setStaged((s) => ({ ...s, [d.id]: true }))}
                          >
                            <UploadCloud className="size-3.5" /> Stage
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Prepare write-back payload</TooltipContent>
                      </Tooltip>
                    )}
                    {staged[d.id] && !pushed[d.id] && (
                      <Button
                        size="sm" className="h-7 gap-1.5 text-xs"
                        disabled={pushing === d.id}
                        onClick={() => push(d.id, d.counts.total)}
                      >
                        {pushing === d.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="size-3.5" />
                        )}
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
          </table>
        </Card>
      </div>
    </div>
  );
}

export default function LitifySync() {
  return (
    <Suspense fallback={<Skeleton className="mt-3 h-[80%] w-full" />}>
      <LitifySyncInner />
    </Suspense>
  );
}
