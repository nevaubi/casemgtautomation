"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, Download, HelpCircle,
  Loader2, Lock, MinusCircle, PenLine, ScanLine, ShieldAlert, XCircle,
} from "lucide-react";

import { getManifest, logAuditEvent, Manifest } from "@/lib/demo";
import { CaseRecord, loadDocRecords } from "@/lib/records";
import { buildCaseProfile, Citation } from "@/lib/case-profile";
import {
  analyseFragility, deriveInsights, evaluate, evaluateTimeline, FactorResult,
  FactorStatus, MATRIX, Scorecard, snapshotScore, Tier,
} from "@/lib/matrix";
import { PageHeader, TintBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ *
 * The page had nine cards competing for attention, which is nine ways of
 * saying nothing. A partner needs one sentence and a picture; everyone else
 * needs the table, but only when they ask for it. So: one verdict, one rail,
 * and the detail behind tabs.
 * ------------------------------------------------------------------ */

const STATUS: Record<FactorStatus, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  met:           { label: "Met",           icon: CheckCircle2,  tone: "text-emerald-600" },
  partial:       { label: "Partial",       icon: CheckCircle2,  tone: "text-emerald-500" },
  clear:         { label: "Clear",         icon: MinusCircle,   tone: "text-slate-400" },
  not_met:       { label: "Not met",       icon: XCircle,       tone: "text-slate-400" },
  adverse:       { label: "Adverse",       icon: AlertTriangle, tone: "text-rose-600" },
  indeterminate: { label: "Open",          icon: CircleHelp,    tone: "text-amber-500" },
  withheld:      { label: "Withheld",      icon: Lock,          tone: "text-orange-600" },
};

function Sources({ citations }: { citations: Citation[] }) {
  if (citations.length === 0)
    return <span className="text-muted-foreground text-[10px] italic">no citable record</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {citations.slice(0, 4).map((c) => (
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
      {citations.length > 4 && (
        <span className="text-muted-foreground text-[10px]">+{citations.length - 4}</span>
      )}
    </div>
  );
}

/** The whole position in one object: where the case sits, where the evidence
 *  actually puts it, and how far the ceiling is. Replaces four number boxes. */
function TierRail({ card, tiers }: { card: Scorecard; tiers: Tier[] }) {
  const asc = [...tiers].sort((a, b) => a.min_points - b.min_points);
  const top = asc[asc.length - 1];
  const scale = Math.max(card.ceiling, top.min_points) + 15;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;

  return (
    <div className="pt-1">
      <div className="relative h-9">
        {/* tier bands */}
        <div className="absolute inset-x-0 top-3 flex h-3 overflow-hidden rounded-full">
          {asc.map((t, i) => {
            const next = asc[i + 1];
            const width = ((next ? next.min_points : scale) - t.min_points) / scale;
            const shade = ["bg-muted", "bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70"][i] ?? "bg-muted";
            return (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <div className={`${shade} h-full cursor-help`} style={{ width: `${width * 100}%` }} />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-[11px] font-medium">
                    {t.label} — from {t.min_points} points
                  </p>
                  <p className="text-[11px] opacity-80">{t.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* ceiling ghost */}
        <div
          className="absolute top-2 h-5 w-0.5 rounded bg-emerald-600/50"
          style={{ left: pct(card.ceiling) }}
        />
        {/* evidence-adjusted */}
        <div
          className="absolute top-1.5 h-6 w-0.5 rounded bg-amber-500"
          style={{ left: pct(card.adjustedPoints) }}
        />
        {/* current */}
        <div
          className="absolute top-0.5 h-8 w-[3px] rounded bg-foreground"
          style={{ left: pct(card.points) }}
        />
      </div>

      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground inline-block h-3 w-[3px] rounded" />
          <span className="text-foreground font-semibold tabular-nums">{card.points}</span> matrix ·{" "}
          {card.tier.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[3px] rounded bg-amber-500" />
          <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {card.adjustedPoints}
          </span>{" "}
          evidence-adjusted · {card.adjustedTier.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[3px] rounded bg-emerald-600/50" />
          <span className="font-semibold tabular-nums text-emerald-700">{card.ceiling}</span> ceiling ·{" "}
          {card.ceilingTier.label}
        </span>
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: FactorResult }) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  const strengthTone =
    f.strength.overall >= 0.85 ? "bg-emerald-600"
    : f.strength.overall >= 0.7 ? "bg-amber-500"
    : "bg-orange-600";

  return (
    <div className="hover:bg-muted/30 grid grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_4.5rem] items-start gap-x-3 px-4 py-2.5">
      <Icon className={`mt-0.5 size-3.5 ${s.tone}`} />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium">{f.label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="text-muted-foreground/50 size-3 shrink-0 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="text-[11px] font-medium">{f.requirement}</p>
              <p className="mt-1 text-[11px] opacity-80">{f.whyItMatters}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{f.finding}</p>
        <div className="mt-1.5">
          <Sources citations={f.citations} />
        </div>
      </div>

      {/* evidence strength */}
      <div className="pt-0.5">
        {f.points !== 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex cursor-help items-center gap-1.5">
                <span className="bg-muted relative inline-block h-1 w-10 rounded-full">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${strengthTone}`}
                    style={{ width: `${Math.round(f.strength.overall * 100)}%` }}
                  />
                </span>
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {Math.round(f.strength.overall * 100)}%
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="text-[11px] font-medium">
                {f.points > 0 ? "How well the file proves this" : "How well the defence can prove this"}
              </p>
              <p className="mt-0.5 text-[11px]">{f.strength.note}.</p>
              <p className="mt-1 font-mono text-[10px] opacity-70">
                confidence {(f.strength.documentary * 100).toFixed(0)}% × corroboration{" "}
                {f.strength.corroboration} × provenance {f.strength.provenance} × contested{" "}
                {f.strength.contested}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground text-[10px]">{s.label}</span>
        )}
      </div>

      <div className="pt-0.5 text-right tabular-nums">
        <span
          className={`text-[13px] font-semibold ${
            f.points > 0 ? "" : f.points < 0 ? "text-rose-600" : "text-muted-foreground"
          }`}
        >
          {f.points > 0 ? `+${f.points}` : f.points}
        </span>
        {f.points > 0 && f.adjustedPoints !== f.points && (
          <span className="text-muted-foreground block text-[10px]">→ {f.adjustedPoints}</span>
        )}
      </div>
    </div>
  );
}

const Panel = ({ children }: { children: React.ReactNode }) => (
  <Card className="gap-0 rounded-lg py-0 shadow-none">{children}</Card>
);

const Head = ({ title, note }: { title: string; note?: string }) => (
  <div className="flex items-baseline gap-2 border-b px-4 py-2.5">
    <span className="text-[13px] font-semibold">{title}</span>
    {note && <span className="text-muted-foreground text-[11px]">{note}</span>}
  </div>
);

/* ------------------------------------------------------------------ */

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

  const card = useMemo(
    () => (manifest && records ? evaluate(buildCaseProfile(manifest, records)) : null),
    [manifest, records]
  );
  const fragility = useMemo(
    () => (manifest && records ? analyseFragility(manifest, records) : []),
    [manifest, records]
  );
  const timeline = useMemo(
    () => (manifest && records ? evaluateTimeline(manifest, records) : []),
    [manifest, records]
  );
  const insights = useMemo(
    () => (card ? deriveInsights(card, fragility) : null),
    [card, fragility]
  );

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
          `${j.verified ? "all figures verified" : `${j.ungroundedFigures.length} ungrounded figure(s) flagged`}`
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
        `Matrix position statement exported — ${card.points} points, ${card.tier.label}`
      );
    } finally {
      setExporting(false);
    }
  };

  if (!card || !manifest || !insights) {
    return (
      <div className="grid h-full content-start gap-3 pt-3">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const categories = [...new Set(card.factors.map((f) => f.category))];
  const open = card.openItems;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={`${manifest.matter.litifyMatterNumber} · ${card.matrixName} v${card.matrixVersion}`}
        title="Settlement grid"
      >
        {card.synthetic && <TintBadge tone="slate">Synthetic matrix</TintBadge>}
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
          Position statement
        </Button>
      </PageHeader>

      {/* ---------- the verdict ---------- */}
      <Card className="shrink-0 gap-0 rounded-lg py-0 shadow-none">
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-2">
            <div className="min-w-0 max-w-2xl">
              <h2 className="text-[17px] leading-tight font-semibold tracking-tight">
                {insights.headline}
              </h2>
              <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
                {insights.subhead}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!card.gatesPassed && <TintBadge tone="rose">Gate failed</TintBadge>}
              {insights.margin.onTheLine && (
                <TintBadge tone="orange">
                  {insights.margin.aboveFloor === 0
                    ? "On the tier line"
                    : `${insights.margin.aboveFloor} pt cushion`}
                </TintBadge>
              )}
              {open.length > 0 && <TintBadge tone="amber">{open.length} open</TintBadge>}
            </div>
          </div>
          <TierRail card={card} tiers={MATRIX.tiers} />
        </div>
      </Card>

      {/* ---------- the detail, only when asked for ---------- */}
      <Tabs defaultValue="scorecard" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="h-7 w-fit shrink-0">
          <TabsTrigger value="scorecard" className="h-6 text-[11px]">Scorecard</TabsTrigger>
          <TabsTrigger value="risk" className="h-6 text-[11px]">
            Risk {fragility.filter((f) => f.dropsATier).length > 0 && `(${fragility.filter((f) => f.dropsATier).length})`}
          </TabsTrigger>
          <TabsTrigger value="actions" className="h-6 text-[11px]">
            Actions ({open.length + insights.corroboration.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="h-6 text-[11px]">History</TabsTrigger>
          <TabsTrigger value="assessment" className="h-6 text-[11px]">Assessment</TabsTrigger>
        </TabsList>

        {/* ---------------- scorecard ---------------- */}
        <TabsContent value="scorecard" className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 pb-1">
            <Panel>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2.5">
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Eligibility gates
                </span>
                {card.gates.map((g) => (
                  <Tooltip key={g.key}>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1.5 text-[12px]">
                        {g.passed ? (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="size-3.5 text-rose-600" />
                        )}
                        {g.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="text-[11px]">{g.finding}</p>
                      <p className="mt-1 font-mono text-[10px] opacity-70">
                        {g.citations.map((c) => `${c.docTitle} p.${c.page}`).join("; ") || "no citation"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </Panel>

            {categories.map((cat) => (
              <Panel key={cat}>
                <Head title={cat} />
                <div className="divide-y">
                  {card.factors
                    .filter((f) => f.category === cat)
                    .map((f) => (
                      <FactorRow key={f.key} f={f} />
                    ))}
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>

        {/* ---------------- risk ---------------- */}
        <TabsContent value="risk" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2">
            <Panel>
              <Head title="What breaks this case" note="each factor struck, the file re-scored" />
              {fragility.filter((f) => f.dropsATier).length > 0 && (
                <div className="flex gap-2 border-b bg-orange-500/10 px-4 py-2.5 text-[11px] text-orange-900 dark:text-orange-300">
                  <ShieldAlert className="mt-px size-3.5 shrink-0" />
                  <span>{insights.subhead.split(".")[0]}. These are the records the defence attacks first.</span>
                </div>
              )}
              <div className="divide-y">
                {fragility.map((f) => (
                  <div key={f.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{f.label}</div>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        Struck: {card.points} → <span className="font-medium">{f.scoreIfStruck}</span>,{" "}
                        {f.tierIfStruck}
                        {f.singleSource && " · one document"}
                      </p>
                      <p className="text-muted-foreground/70 mt-0.5 truncate text-[10px]">
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
                ))}
              </div>
            </Panel>

            <Panel>
              <Head title="The defence's case" note="assembled from your own file" />
              <div className="divide-y">
                {insights.defence.map((d, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          d.severity === "high" ? "bg-rose-600"
                          : d.severity === "medium" ? "bg-amber-500"
                          : "bg-slate-400"
                        }`}
                      />
                      <span className="text-[13px] font-medium">{d.label}</span>
                      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        {d.kind.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{d.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* ---------------- actions ---------------- */}
        <TabsContent value="actions" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2">
            <Panel>
              <Head title="Collect" note="missing evidence, ranked by expected value" />
              <div className="divide-y">
                {open.length === 0 && (
                  <div className="text-muted-foreground px-4 py-6 text-center text-xs">
                    Every factor is resolved on the records in hand.
                  </div>
                )}
                {open.map((f, i) => (
                  <div key={f.key} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">
                          <span className="text-muted-foreground mr-1.5 font-mono text-[11px]">
                            {i + 1}.
                          </span>
                          {f.label}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">{f.evidenceNeeded}</p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block rounded bg-amber-500/15 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                          {f.expectedGain !== null
                            ? `${f.expectedGain > 0 ? "+" : ""}${f.expectedGain}`
                            : `+${f.swing}`}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block text-[10px] tabular-nums">
                          {f.bestCase > 0 && `+${f.bestCase}`} / {f.worstCase}
                        </span>
                      </span>
                    </div>
                    {f.priorRationale && (
                      <p
                        className={`mt-1.5 rounded px-2 py-1 text-[11px] ${
                          f.worstCase < 0
                            ? "bg-rose-500/10 text-rose-900 dark:text-rose-300"
                            : "bg-muted/60"
                        }`}
                      >
                        <span className="font-medium">
                          {f.worstCase < 0 ? "This request can hurt you. " : ""}
                          {Math.round((f.priorFavourable ?? 0) * 100)}% likely to help.
                        </span>{" "}
                        <span className="text-muted-foreground">{f.priorRationale}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <Head
                title="Corroborate"
                note={`${insights.recoverable} points recoverable with no new facts`}
              />
              <div className="border-b bg-muted/40 px-4 py-2 text-[11px]">
                These facts are <span className="font-medium">already proved</span> — they are just not
                proved <span className="italic">well</span>. Nothing new has to be discovered; the file
                only has to be made harder to attack.
              </div>
              <div className="divide-y">
                {insights.corroboration.map((c) => (
                  <div key={c.key} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{c.label}</div>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {Math.round(c.strength * 100)}% — {c.reason}
                        </p>
                        <p className="mt-1 flex items-start gap-1 text-[11px]">
                          <ArrowRight className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                          {c.action}
                        </p>
                      </div>
                      <span className="bg-muted shrink-0 rounded px-2 py-0.5 text-[12px] font-semibold tabular-nums">
                        +{c.recoverable}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* ---------------- history ---------------- */}
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <Panel>
            <Head title="Score history" note="replayed in the order records were received" />
            <div className="divide-y">
              {timeline.map((s) => {
                const max = Math.max(...timeline.map((x) => x.points), 1);
                return (
                  <div key={s.docId} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-medium">{s.facility}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span
                          className={`text-[11px] font-medium tabular-nums ${
                            s.pointsDelta > 0 ? "text-emerald-700" : "text-muted-foreground"
                          }`}
                        >
                          {s.pointsDelta > 0 ? `+${s.pointsDelta}` : "±0"}
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums">{s.points}</span>
                        <span className="text-muted-foreground w-14 text-right text-[11px]">
                          {s.tier.label}
                        </span>
                      </span>
                    </div>
                    <div className="bg-muted mt-1.5 h-1 w-full rounded-full">
                      <div
                        className="bg-primary h-1 rounded-full"
                        style={{ width: `${(s.points / max) * 100}%` }}
                      />
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-[11px]">
                      <span className="font-mono">{s.received}</span>
                      <span>{s.records} records</span>
                      {s.changes
                        .filter((c) => c.delta !== 0)
                        .map((c) => (
                          <span key={c.key}>
                            {c.label} <span className="font-medium">{c.delta > 0 ? `+${c.delta}` : c.delta}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </TabsContent>

        {/* ---------------- assessment ---------------- */}
        <TabsContent value="assessment" className="min-h-0 flex-1 overflow-y-auto">
          <Panel>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-[13px] font-semibold">Case assessment</span>
              {memo.state === "done" &&
                (memo.verified ? (
                  <TintBadge tone="emerald">every figure verified against the scorecard</TintBadge>
                ) : (
                  <TintBadge tone="orange">{memo.ungrounded.length} figure(s) not in the scorecard</TintBadge>
                ))}
            </div>
            <div className="px-4 py-3">
              {memo.state === "idle" && (
                <div className="text-muted-foreground py-8 text-center text-xs">
                  <p>Drafted by Claude from the finished scorecard — never from the records.</p>
                  <p className="mt-1">
                    It can describe the score. It cannot compute one, and every figure it writes is
                    checked back against the scorecard before you see it.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={draftMemo}>
                    <PenLine className="size-3.5" /> Draft assessment
                  </Button>
                </div>
              )}
              {memo.state === "running" && (
                <p className="text-muted-foreground flex items-center gap-2 py-8 text-center text-xs">
                  <Loader2 className="size-3.5 animate-spin" /> Drafting from the scorecard…
                </p>
              )}
              {memo.state === "error" && <p className="text-[12px] text-orange-700">{memo.message}</p>}
              {memo.state === "done" && (
                <div className="max-w-3xl">
                  {!memo.verified && (
                    <p className="mb-3 rounded bg-orange-500/10 px-2 py-1.5 text-[11px] text-orange-900 dark:text-orange-300">
                      These figures appear in the memo but not in the scorecard, and should not be
                      relied on: {memo.ungrounded.join(", ")}
                    </p>
                  )}
                  {memo.text.split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="mb-2.5 text-[13px] leading-relaxed last:mb-0">
                      {para}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground shrink-0 text-[10px] italic">{card.disclaimer}</p>
    </div>
  );
}
