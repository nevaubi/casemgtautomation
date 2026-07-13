"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Loader2 } from "lucide-react";

import { getManifest, loadDocFindings, Manifest } from "@/lib/demo";
import { buildCaseProfile, CaseProfile } from "@/lib/case-profile";
import { PageHeader, TintBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function CaseProfilePage() {
  const [profile, setProfile] = useState<CaseProfile | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const manifest: Manifest = await getManifest();
      const entries = await Promise.all(
        manifest.documents.map(async (d) => [d.id, await loadDocFindings(d)] as const)
      );
      setProfile(buildCaseProfile(manifest, new Map(entries)));
    })();
  }, []);

  const exportDocx = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      const res = await fetch("/api/case-profile/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Plaintiff-Fact-Sheet-Draft-${profile.matter.litifyMatterNumber}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (!profile) {
    return (
      <div className="grid h-full content-start gap-3 pt-3">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={`${profile.matter.litifyMatterNumber} · auto-compiled from ${profile.totals.documents} documents`}
        title="Case profile"
        description="Cross-document synthesis of every finding into a standardized fact-sheet view — draft, not final, until exported and reviewed."
      >
        <TintBadge tone="slate">{profile.totals.findings} findings synthesized</TintBadge>
        <Button size="sm" onClick={exportDocx} disabled={exporting}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export fact sheet (.docx)
        </Button>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pb-1 lg:grid-cols-2">
        {/* Exposure history */}
        <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
          <div className="border-b px-4 py-2.5">
            <span className="text-[13px] font-semibold">Exposure &amp; medication history</span>
            <span className="text-muted-foreground ml-2 text-[11px]">
              deduplicated across all documents
            </span>
          </div>
          <div className="divide-y">
            {profile.exposures.map((e) => (
              <div key={e.drug} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{e.drug}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {e.mentionCount} mention{e.mentionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {e.firstDateFound && e.lastDateFound
                    ? e.firstDateFound === e.lastDateFound
                      ? `Documented ${e.firstDateFound}`
                      : `${e.firstDateFound} — ${e.lastDateFound}`
                    : "No explicit date captured in evidence"}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {e.citations.map((c, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <Link
                          href={`/workbench/${c.docId}`}
                          className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {c.docTitle.split(" ").slice(0, 2).join(" ")} p.{c.page}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">{c.evidence}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Diagnosis timeline */}
        <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
          <div className="border-b px-4 py-2.5">
            <span className="text-[13px] font-semibold">Diagnosis &amp; symptom timeline</span>
            <span className="text-muted-foreground ml-2 text-[11px]">
              earliest documented occurrence first
            </span>
          </div>
          <div className="divide-y">
            {profile.diagnoses.map((dgn) => (
              <div key={dgn.condition} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{dgn.condition}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {dgn.mentionCount} mention{dgn.mentionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {dgn.firstDateFound ? `First documented ${dgn.firstDateFound}` : "Date not captured"}
                  {dgn.negatedElsewhere && " · also denied at a later visit"}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {dgn.citations.map((c, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <Link
                          href={`/workbench/${c.docId}`}
                          className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {c.docTitle.split(" ").slice(0, 2).join(" ")} p.{c.page}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">{c.evidence}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Causation evidence */}
        <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
          <div className="border-b px-4 py-2.5">
            <span className="text-[13px] font-semibold">Causation language</span>
            <span className="text-muted-foreground ml-2 text-[11px]">
              verbatim quotes linking exposure to diagnosis
            </span>
          </div>
          <div className="divide-y">
            {profile.causation.length === 0 && (
              <div className="text-muted-foreground px-4 py-6 text-center text-xs">
                No causation language found in this document set.
              </div>
            )}
            {profile.causation.map((c, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-[12.5px] italic">“…{c.quote}…”</p>
                <Link
                  href={`/workbench/${c.citation.docId}`}
                  className="text-muted-foreground mt-1 inline-block font-mono text-[10px] hover:underline"
                >
                  {c.citation.docTitle} · p.{c.citation.page} · {(c.citation.confidence * 100).toFixed(0)}%
                  confidence
                </Link>
              </div>
            ))}
          </div>
        </Card>

        {/* Providers & source documents */}
        <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
          <div className="border-b px-4 py-2.5">
            <span className="text-[13px] font-semibold">Providers, facilities &amp; sources</span>
            <span className="text-muted-foreground ml-2 text-[11px]">
              {profile.totals.autoAccepted} auto-accepted · {profile.totals.needsReview} required review
            </span>
          </div>
          <div className="divide-y">
            {profile.providers.map((p) => (
              <Link
                key={p.docId}
                href={`/workbench/${p.docId}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="min-w-0 truncate text-[13px]">{p.facility}</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {p.docType} · {p.received}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
