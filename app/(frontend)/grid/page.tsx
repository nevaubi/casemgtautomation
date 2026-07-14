"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  HelpCircle,
  Loader2,
  Lock,
  MinusCircle,
  PenLine,
  ScanLine,
  ShieldAlert,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { CaseRecord, loadDocRecords } from "@/lib/records";
import { buildCaseProfile, Citation } from "@/lib/case-profile";
import {
  analyseFragility, evaluate, evaluateTimeline, FactorResult, FactorStatus,
  FragilityResult, Scorecard, snapshotScore, TimelineStep,
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
          {f.points !== 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-help items-center gap-1">
                  <span className="bg-muted relative inline-block h-1 w-12 rounded-full">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        f.strength.overall >= 0.85 ? "bg-emerald-600"
                        : f.strength.overall >= 0.7 ? "bg-amber-500"
                        : "bg-orange-600"
                      }`}
                      style={{ width: `${Math.round(f.strength.overall * 100)}%` }}
                    />
                  </span>
                  <span className="text-muted-foreground w-7 text-[11px] tabular-nums">
                    {Math.round(f.strength.overall * 100)}%
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-[11px] font-medium">
                  {f.points > 0 ? "Evidence strength" : "Strength of the defence's support for this"}
                </p>
                <p className="mt-0.5 text-[11px]">{f.strength.note}.</p>
                <p className="mt-1 font-mono text-[10px] opacity-70">
                  confidence {(f.strength.documentary * 100).toFixed(0)}% × corroboration{" "}
                  {f.strength.corroboration} × provenance {f.strength.provenance} × contested{" "}
                  {f.strength.contested}
                </p>
                {f.points < 0 && (
                  <p className="mt-1 text-[11px] italic">
                    Adverse factors are carried at full weight — the assumption is that the defence
                    lands it. But weak support here is an opening to attack it.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          )}
          <span className={`text-[11px] font-medium ${s.tone}`}>{s.label}</span>
          <span className="w-16 text-right tabular-nums">
            <span
              className={`text-[13px] font-semibold ${
                f.points > 0 ? "text-foreground" : f.points < 0 ? "text-rose-600" : "text-muted-foreground"
              }`}
            >
              {f.points > 0 ? `+${f.points}` : f.points}
            </span>
            {f.points > 0 && f.adjustedPoints !== f.points && (
              <span className="text-muted-foreground ml-1 text-[10px]">→{f.adjustedPoints}</span>
            )}
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

function Fragility({ items, points, tier }: { items: FragilityResult[]; points: number; tier: string }) {
  const fatal = items.filter((f) => f.dropsATier);
  return (
    <div>
      {fatal.length > 0 && (
        <div className="flex gap-2 border-b bg-orange-500/10 px-4 py-2.5 text-[11px] text-orange-900 dark:text-orange-300">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          <span>
            <span className="font-medium">
              This case sits on the {tier} line at {points} points.
            </span>{" "}
            {fatal.length === items.length
              ? "Every scoring factor is load-bearing — the loss of any one of them drops a tier."
              : `${fatal.length} of ${items.length} factors are load-bearing.`}{" "}
            These are the records the defence will attack first.
          </span>
        </div>
      )}
      <div className="divide-y">
        {items.map((f) => (
          <div key={f.key} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{f.label}</div>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  Struck out: {points} → <span className="font-medium">{f.scoreIfStruck} points</span>,{" "}
                  {f.tierIfStruck}
                  {f.singleSource ? " · rests on one document" : ` · ${f.documents.length} documents`}
                </p>
                <p className="text-muted-foreground/80 mt-0.5 truncate text-[10px]">
                  {f.documents.join(" · ")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
                  f.dropsATier
                    ? "bg-orange-500/15 text-orange-800 dark:text-orange-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                −{f.pointsAtRisk}
              </span>
            </div>
          </div>
        ))}
      </div>
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
  const [memo, setMemo] = useState<
    | { state: "idle" }
    | { state: "running" }
    | { state: "done"; text: string; verified: boolean; ungrounded: string[] }
    | { state: "error"; message: string }
  >({ state: "idle" });

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
  const fragility = useMemo(
    () => (manifest && records ? analyseFragility(manifest, records) : []),
    [manifest, records]
  );

  /** The model may describe the score. It may not compute one — and every figure it
   *  writes is checked back against the scorecard before the memo is shown. */
  const draftMemo = async () => {
    if (!card || !manifest) return;
    setMemo({ state: "running" });
    try {
      const res = await fetch("/api/case-grid/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorecard: card, fragility, matter: manifest.matter }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMemo({
        state: "done",
        text: j.memo as string,
        verified: j.verified as boolean,
        ungrounded: (j.ungroundedFigures ?? []) as string[],
      });
      await logAuditEvent(
        "grid.memo_drafted",
        null,
        `Assessment memo drafted from scorecard v${card.matrixVersion} — ` +
          `${j.verified ? "all figures verified against the scorecard" : `${j.ungroundedFigures.length} ungrounded figure(s) flagged`}`
      );
    } catch (err) {
      setMemo({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const exportDocx = async () => {
    if (!card || !manifest) return;
    setExporting(true);
    try {
      const res = await fetch("/api/case-grid/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorecard: card, matter: manifest.matter, timeline, fragility }),
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
        <Button size="sm" variant="outline" onClick={draftMemo} disabled={memo.state === "running"}>
          {memo.state === "running" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PenLine className="size-3.5" />
          )}
          Draft assessment
        </Button>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-muted-foreground cursor-help text-[10px] tracking-wide uppercase">
                  Evidence-adjusted
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-[11px]">
                  Matrix points weighted by how well the file actually proves each fact —
                  extraction confidence × corroboration × first-hand provenance × whether the
                  fact is contested. Positive points only: you discount your own evidence, never
                  the other side&apos;s.
                </p>
              </TooltipContent>
            </Tooltip>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  card.adjustedTier.key !== card.tier.key ? "text-amber-700 dark:text-amber-400" : ""
                }`}
              >
                {card.adjustedPoints}
              </span>
              {card.adjustedTier.key !== card.tier.key && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                  {card.adjustedTier.label}
                </span>
              )}
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
        {card.adjustedTier.key !== card.tier.key && (
          <div className="flex gap-2 border-t bg-amber-500/10 px-4 py-2 text-[11px] text-amber-900 dark:text-amber-300">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>
              <span className="font-medium">
                The matrix scores this case at {card.tier.label}; the evidence only supports{" "}
                {card.adjustedTier.label}.
              </span>{" "}
              The {Math.round((card.points - card.adjustedPoints) * 10) / 10}-point gap is where the
              file is thin — single-source facts, second-hand reports, and contested values. Closing
              it is corroboration work, not collection work.
            </span>
          </div>
        )}
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
          {memo.state !== "idle" && (
            <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-[13px] font-semibold">Case assessment</span>
                {memo.state === "done" &&
                  (memo.verified ? (
                    <TintBadge tone="emerald">every figure verified against the scorecard</TintBadge>
                  ) : (
                    <TintBadge tone="orange">
                      {memo.ungrounded.length} figure(s) not in the scorecard
                    </TintBadge>
                  ))}
              </div>
              <div className="px-4 py-3">
                {memo.state === "running" && (
                  <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader2 className="size-3.5 animate-spin" /> Drafting from the scorecard…
                  </p>
                )}
                {memo.state === "error" && (
                  <p className="text-[12px] text-orange-700">{memo.message}</p>
                )}
                {memo.state === "done" && (
                  <>
                    {!memo.verified && (
                      <p className="mb-2 rounded bg-orange-500/10 px-2 py-1 text-[11px] text-orange-900 dark:text-orange-300">
                        These figures appear in the memo but not in the scorecard, and should not be
                        relied on: {memo.ungrounded.join(", ")}
                      </p>
                    )}
                    {memo.text.split(/\n{2,}/).map((para, i) => (
                      <p key={i} className="mb-2 text-[12.5px] leading-relaxed last:mb-0">
                        {para}
                      </p>
                    ))}
                  </>
                )}
              </div>
            </Card>
          )}

          <Section
            title="Request these records next"
            note="ranked by expected value — not by best case"
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
                    {f.priorRationale && (
                      <p className="mt-1 rounded bg-muted/60 px-2 py-1 text-[11px]">
                        <span className="font-medium">
                          {Math.round((f.priorFavourable ?? 0) * 100)}% likely to help
                        </span>{" "}
                        <span className="text-muted-foreground">{f.priorRationale}</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block rounded bg-amber-500/15 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                      {f.expectedGain !== null
                        ? `${f.expectedGain > 0 ? "+" : ""}${f.expectedGain} exp.`
                        : `+${f.swing}`}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-[10px] tabular-nums">
                      best +{f.bestCase} / worst {f.worstCase}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </Section>

          <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
            <div className="flex items-baseline gap-2 border-b px-4 py-2.5">
              <span className="text-[13px] font-semibold">What breaks this case</span>
              <span className="text-muted-foreground text-[11px]">
                each factor&apos;s evidence struck out, and the file re-scored
              </span>
            </div>
            <Fragility items={fragility} points={card.points} tier={card.tier.label} />
          </Card>

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
