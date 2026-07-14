"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, CircleHelp, Download, HelpCircle, Loader2,
  Lock, MinusCircle, ScanLine, TrendingUp, XCircle,
} from "lucide-react";

import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { CaseRecord, loadDocRecords } from "@/lib/records";
import { buildCaseProfile, Citation } from "@/lib/case-profile";
import {
  evaluate, evaluateTimeline, FactorResult, FactorStatus, Scorecard, snapshotScore, TimelineStep,
} from "@/lib/matrix";
import { PageHeader, TintBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS: Record<
  FactorStatus,
  { label: string; icon: typeof CheckCircle2; tone: string; dot: string }
> = {
  met:           { label: "Met",           icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-600" },
  partial:       { label: "Partial",       icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  clear:         { label: "Clear",         icon: MinusCircle,  tone: "text-slate-600 dark:text-slate-400",     dot: "bg-slate-400" },
  not_met:       { label: "Not met",       icon: XCircle,      tone: "text-slate-600 dark:text-slate-400",     dot: "bg-slate-400" },
  adverse:       { label: "Adverse",       icon: AlertTriangle,tone: "text-rose-700 dark:text-rose-400",       dot: "bg-rose-600" },
  indeterminate: { label: "Indeterminate", icon: CircleHelp,   tone: "text-amber-700 dark:text-amber-300",     dot: "bg-amber-500" },
  withheld:      { label: "Withheld",      icon: Lock,         tone: "text-orange-700 dark:text-orange-400",   dot: "bg-orange-600" },
};

function Sources({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return <span className="text-muted-foreground text-[10px] italic">no citable record</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {citations.map((c) => (
        <Tooltip key={c.recordId}>
          <TooltipTrigger asChild>
            <Link
              href={`/workbench/${c.docId}?page=${c.page}`}
              className="bg-muted hover:bg-accent inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
            >
              {c.source === "ocr" && <ScanLine className="size-2.5 opacity-60" />}
              {c.docTitle.split(/[ —-]/).slice(0, 2).join(" ")} p.{c.page}
            </Link>
          </TooltipTrigger>
          <TooltipContent className="max-w-md">
            <p className="text-[11px] italic">“{c.quote}”</p>
            <p className="mt-1 font-mono text-[10px] opacity-70">
              {c.docTitle} · p.{c.page} · {(c.confidence * 100).toFixed(0)}% · {c.routing}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function FactorRow({ f }: { f: FactorResult }) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <Icon className={`mt-0.5 size-3.5 shrink-0 ${s.tone}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium">{f.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="text-muted-foreground/60 size-3 shrink-0 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-[11px] font-medium">{f.requirement}</p>
                  <p className="mt-1 text-[11px] opacity-80">{f.whyItMatters}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11px]">{f.finding}</p>
            {(f.status === "indeterminate" || f.status === "withheld") && f.evidenceNeeded && (
              <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                <span className="font-medium">Worth up to {f.swing} points.</span> {f.evidenceNeeded}
              </p>
            )}
            <div className="mt-1.5">
              <Sources citations={f.citations} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-[11px] font-medium ${s.tone}`}>{s.label}</span>
          <span
            className={`w-10 text-right text-[13px] font-semibold tabular-nums ${
              f.points > 0 ? "text-foreground" : f.points < 0 ? "text-rose-600" : "text-muted-foreground"
            }`}
          >
            {f.points > 0 ? `+${f.points}` : f.points}
          </span>
        </div>
      </div>
    </div>
  );
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  const max = Math.max(...steps.map((s) => s.points), 1);
  return (
    <div className="divide-y">
      {steps.map((s) => (
        <div key={s.docId} className="px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium">{s.facility}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span
                className={`text-[11px] font-medium tabular-nums ${
                  s.pointsDelta > 0 ? "text-emerald-700" : s.pointsDelta < 0 ? "text-rose-600" : "text-muted-foreground"
                }`}
              >
                {s.pointsDelta > 0 ? `+${s.pointsDelta}` : s.pointsDelta === 0 ? "±0" : s.pointsDelta}
              </span>
              <span className="text-[13px] font-semibold tabular-nums">{s.points}</span>
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="font-mono">{s.received}</span>
            <span>· {s.records} records</span>
            {s.tierChanged && (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <TrendingUp className="size-3" /> {s.tier.label}
              </span>
            )}
          </div>
          <div className="bg-muted mt-1.5 h-1 w-full rounded-full">
            <div
              className="bg-primary h-1 rounded-full transition-all"
              style={{ width: `${Math.max(0, (s.points / max) * 100)}%` }}
            />
          </div>
          {s.changes.filter((c) => c.delta !== 0).length > 0 && (
            <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-[11px]">
              {s.changes
                .filter((c) => c.delta !== 0)
                .map((c) => (
                  <li key={c.key} className="flex items-baseline gap-1.5">
                    <span className={`mt-1 size-1 shrink-0 rounded-full ${STATUS[c.to].dot}`} />
                    <span className="min-w-0">
                      {c.label}{" "}
                      <span className="opacity-70">
                        {c.from} → {c.to}
                      </span>{" "}
                      <span className="font-medium tabular-nums">
                        {c.delta > 0 ? `+${c.delta}` : c.delta}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
    <div className="flex items-baseline gap-2 border-b px-4 py-2.5">
      <span className="text-[13px] font-semibold">{title}</span>
      {note && <span className="text-muted-foreground text-[11px]">{note}</span>}
    </div>
    <div className="divide-y">{children}</div>
  </Card>
);

export default function SettlementGridPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [records, setRecords] = useState<Map<string, CaseRecord[]> | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const man = await getManifest();
      const entries = await Promise.all(
        man.documents.map(async (d) => [d.id, await loadDocRecords(d)] as const)
      );
      setManifest(man);
      setRecords(new Map(entries));
    })();
  }, []);

  const card: Scorecard | null = useMemo(
    () => (manifest && records ? evaluate(buildCaseProfile(manifest, records)) : null),
    [manifest, records]
  );
  const timeline = useMemo(
    () => (manifest && records ? evaluateTimeline(manifest, records) : []),
    [manifest, records]
  );

  const exportDocx = async () => {
    if (!card || !manifest) return;
    setExporting(true);
    try {
      const res = await fetch("/api/case-grid/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorecard: card, matter: manifest.matter, timeline }),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Matrix-Position-${manifest.matter.litifyMatterNumber}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      await snapshotScore(manifest.matter.id, card);
      await logAuditEvent(
        "grid.exported",
        null,
        `Matrix position statement exported — ${card.points} points, ${card.tier.label}, ` +
          `matrix v${card.matrixVersion}, ${card.openItems.length} open factor(s)`
      );
    } finally {
      setExporting(false);
    }
  };

  if (!card || !manifest) {
    return (
      <div className="grid h-full content-start gap-3 pt-3">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const categories = [...new Set(card.factors.map((f) => f.category))];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={`${manifest.matter.litifyMatterNumber} · ${card.matrixName} · v${card.matrixVersion}`}
        title="Settlement grid"
        description="Scored by a deterministic rules engine from the extracted records. Every point cites a page; no point is awarded without one."
      >
        {card.synthetic && <TintBadge tone="slate">Synthetic matrix</TintBadge>}
        <TintBadge tone={card.gatesPassed ? "emerald" : "rose"}>
          {card.gatesPassed ? "Gates passed" : "Gate failed"}
        </TintBadge>
        <Button size="sm" onClick={exportDocx} disabled={exporting}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Position statement (.docx)
        </Button>
      </PageHeader>

      {/* Score banner */}
      <Card className="shrink-0 gap-0 rounded-lg py-0 shadow-none">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
          <div>
            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">Current position</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{card.points}</span>
              <span className="text-muted-foreground text-[13px]">points</span>
              <span className="bg-primary text-primary-foreground ml-1 rounded px-2 py-0.5 text-[12px] font-semibold">
                {card.tier.label}
              </span>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Ceiling if open factors resolve
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-emerald-700">{card.ceiling}</span>
              <span className="text-muted-foreground text-[13px]">points</span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">
                {card.ceilingTier.label}
              </span>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">Floor</div>
            <div className="text-2xl font-semibold tabular-nums">{card.floor}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">Evidence</div>
            <div className="text-[13px]">
              {card.records} records · {card.documents} documents ·{" "}
              <span className="font-medium">
                {card.openItems.length} factor{card.openItems.length === 1 ? "" : "s"} unresolved
              </span>
            </div>
          </div>
        </div>
        <div className="text-muted-foreground border-t px-4 py-1.5 text-[10px] italic">
          {card.disclaimer}
        </div>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pb-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Section title="Eligibility gates" note="all must pass for the case to score at all">
            {card.gates.map((g) => (
              <div key={g.key} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  {g.passed ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{g.label}</div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">{g.finding}</p>
                    <div className="mt-1.5">
                      <Sources citations={g.citations} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Section>

          {categories.map((cat) => (
            <Section key={cat} title={cat} note="scored factors">
              {card.factors.filter((f) => f.category === cat).map((f) => (
                <FactorRow key={f.key} f={f} />
              ))}
            </Section>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Section
            title="Request these records next"
            note="ranked by points at stake, not by convenience"
          >
            {card.openItems.length === 0 && (
              <div className="text-muted-foreground px-4 py-6 text-center text-xs">
                Every factor is resolved on the records in hand.
              </div>
            )}
            {card.openItems.map((f, i) => (
              <div key={f.key} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">
                      <span className="text-muted-foreground mr-1.5 font-mono text-[11px]">{i + 1}.</span>
                      {f.label}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">{f.evidenceNeeded}</p>
                    <p className="text-muted-foreground/80 mt-1 text-[11px] italic">{f.finding}</p>
                  </div>
                  <span className="shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    +{f.swing}
                  </span>
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Score history"
            note="replayed in the order records were received"
          >
            <Timeline steps={timeline} />
          </Section>
        </div>
      </div>
    </div>
  );
}
