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
 * A settlement matrix is a worksheet, not a feed.
 *
 * The Duke Bolch MDL guidelines describe the canonical form — "an
 * easy-to-comprehend grid" of base points adjusted by objective criteria — and
 * they warn that elaboration is a cost, not a virtue: the more intricate the
 * matrix, the more eligibility disputes it breeds. So this page stops trying to
 * be a dashboard. Every factor is one row. Every number lives in a column with
 * the numbers above and below it. Sections subtotal. The whole thing reads the
 * way a claims administrator already knows how to read.
 * ------------------------------------------------------------------ */

/** One grid definition, used by the header, every row, and the totals — which is
 *  what makes the columns actually line up. */
const COLS =
  "grid grid-cols-[20px_minmax(190px,1fr)_minmax(0,2fr)_76px_108px_50px_50px] items-start gap-x-3";

const STATUS: Record<FactorStatus, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  met:           { label: "Met",      icon: CheckCircle2,  tone: "text-emerald-600" },
  partial:       { label: "Partial",  icon: CheckCircle2,  tone: "text-emerald-500" },
  clear:         { label: "Clear",    icon: MinusCircle,   tone: "text-slate-400" },
  not_met:       { label: "Not met",  icon: XCircle,       tone: "text-slate-400" },
  adverse:       { label: "Adverse",  icon: AlertTriangle, tone: "text-rose-600" },
  indeterminate: { label: "Open",     icon: CircleHelp,    tone: "text-amber-500" },
  withheld:      { label: "Withheld", icon: Lock,          tone: "text-orange-600" },
};

const num = (n: number) => (n > 0 ? `+${n}` : String(n));

function Sources({ citations }: { citations: Citation[] }) {
  if (citations.length === 0)
    return <span className="text-muted-foreground text-[10px] italic">none</span>;
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-0.5">
      {citations.slice(0, 2).map((c) => (
        <Tooltip key={c.recordId}>
          <TooltipTrigger asChild>
            <Link
              href={`/workbench/${c.docId}?page=${c.page}`}
              className="bg-muted hover:bg-accent inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px font-mono text-[10px] leading-4 whitespace-nowrap"
            >
              {c.source === "ocr" && <ScanLine className="size-2.5 opacity-60" />}
              {c.docTitle.split(/[ —-]/)[0].slice(0, 9)} p.{c.page}
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
      {citations.length > 2 && (
        <span className="text-muted-foreground font-mono text-[10px] leading-4">
          +{citations.length - 2}
        </span>
      )}
    </div>
  );
}

function TierRail({ card, tiers }: { card: Scorecard; tiers: Tier[] }) {
  const asc = [...tiers].sort((a, b) => a.min_points - b.min_points);
  const top = asc[asc.length - 1];
  const scale = Math.max(card.ceiling, top.min_points) + 12;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;
  const shades = ["bg-muted", "bg-primary/15", "bg-primary/30", "bg-primary/50", "bg-primary/70"];

  return (
    <div className="mt-3">
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-0 flex h-4 overflow-hidden rounded">
          {asc.map((t, i) => {
            const next = asc[i + 1];
            const width = ((next ? next.min_points : scale) - t.min_points) / scale;
            return (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <div
                    className={`${shades[i]} h-full cursor-help border-r border-background/60 last:border-0`}
                    style={{ width: `${width * 100}%` }}
                  />
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

        {/* tier boundary labels */}
        {asc.map((t) => (
          <span
            key={t.key}
            className="text-muted-foreground absolute top-[18px] font-mono text-[9px] tabular-nums"
            style={{ left: pct(t.min_points) }}
          >
            <span className="-ml-px block border-l border-border pl-1 leading-3">{t.min_points}</span>
          </span>
        ))}

        <div className="absolute top-[-3px] h-[22px] w-0.5 rounded bg-emerald-600/60" style={{ left: pct(card.ceiling) }} />
        <div className="absolute top-[-3px] h-[22px] w-0.5 rounded bg-amber-500" style={{ left: pct(card.adjustedPoints) }} />
        <div className="absolute top-[-5px] h-[26px] w-[3px] rounded bg-foreground" style={{ left: pct(card.points) }} />
      </div>

      <div className="text-muted-foreground -mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
        <span className="flex items-baseline gap-1.5">
          <span className="bg-foreground inline-block h-2.5 w-[3px] translate-y-px rounded" />
          <span className="text-foreground font-semibold tabular-nums">{card.points}</span>
          <span>matrix · {card.tier.label}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="inline-block h-2.5 w-[3px] translate-y-px rounded bg-amber-500" />
          <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {card.adjustedPoints}
          </span>
          <span>evidence-adjusted · {card.adjustedTier.label}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="inline-block h-2.5 w-[3px] translate-y-px rounded bg-emerald-600/60" />
          <span className="font-semibold tabular-nums text-emerald-700">{card.ceiling}</span>
          <span>ceiling · {card.ceilingTier.label}</span>
        </span>
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: FactorResult }) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  const tone =
    f.strength.overall >= 0.85 ? "bg-emerald-600"
    : f.strength.overall >= 0.7 ? "bg-amber-500"
    : "bg-orange-600";

  return (
    <div className={`${COLS} hover:bg-muted/30 border-t px-4 py-2`}>
      <Icon className={`mt-[3px] size-3.5 ${s.tone}`} />

      <div className="min-w-0">
        <span className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium">{f.label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="text-muted-foreground/40 size-3 shrink-0 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="text-[11px] font-medium">{f.requirement}</p>
              <p className="mt-1 text-[11px] opacity-80">{f.whyItMatters}</p>
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
          {s.label}
        </span>
      </div>

      <p className="text-muted-foreground line-clamp-2 text-[11.5px] leading-snug">{f.finding}</p>

      <div className="pt-0.5">
        {f.points !== 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex cursor-help items-center gap-1.5">
                <span className="bg-muted relative inline-block h-1 w-8 shrink-0 rounded-full">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${tone}`}
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
          <span className="text-muted-foreground/50 text-[10px]">—</span>
        )}
      </div>

      <Sources citations={f.citations} />

      <span
        className={`text-right text-[12.5px] font-semibold tabular-nums ${
          f.points > 0 ? "" : f.points < 0 ? "text-rose-600" : "text-muted-foreground/50"
        }`}
      >
        {f.points === 0 ? "—" : num(f.points)}
      </span>
      <span className="text-muted-foreground text-right text-[12.5px] tabular-nums">
        {f.points > 0 ? f.adjustedPoints : "—"}
      </span>
    </div>
  );
}

const SectionRow = ({ label, points }: { label: string; points: number }) => (
  <div className={`${COLS} bg-muted/50 border-t px-4 py-1`}>
    <span />
    <span className="text-muted-foreground col-span-4 text-[10px] font-semibold tracking-[0.08em] uppercase">
      {label}
    </span>
    <span className="text-muted-foreground text-right text-[11px] font-semibold tabular-nums">
      {num(points)}
    </span>
    <span />
  </div>
);

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
  const insights = useMemo(() => (card ? deriveInsights(card, fragility) : null), [card, fragility]);

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
          `${j.verified ? "all figures verified" : `${j.ungroundedFigures.length} ungrounded figure(s)`}`
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
      await logAuditEvent("grid.exported", null, `Position statement — ${card.points} pts, ${card.tier.label}`);
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

  const sections = [...new Set(card.factors.map((f) => f.section))];
  const open = card.openItems;
  const fatal = fragility.filter((f) => f.dropsATier);

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

      {/* ---------- verdict ---------- */}
      <Card className="shrink-0 gap-0 rounded-lg py-0 shadow-none">
        <div className="grid gap-x-8 gap-y-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] leading-tight font-semibold tracking-tight">
                {insights.headline}
              </h2>
              {!card.gatesPassed && <TintBadge tone="rose">Gate failed</TintBadge>}
              {insights.margin.onTheLine && (
                <TintBadge tone="orange">
                  {insights.margin.aboveFloor === 0
                    ? "No cushion"
                    : `${insights.margin.aboveFloor} pt cushion`}
                </TintBadge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 max-w-3xl text-[12.5px] leading-relaxed">
              {insights.subhead}
            </p>
          </div>

          {/* the three numbers, in a fixed column so they never drift */}
          <div className="flex shrink-0 gap-6 lg:justify-end">
            {[
              { k: "Base", v: num(card.basePoints), sub: "the injury" },
              { k: "Adjustments", v: num(card.adjustmentPoints), sub: "everything else" },
              { k: "Total", v: String(card.points), sub: card.tier.label, big: true },
            ].map((x) => (
              <div key={x.k} className="text-right">
                <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{x.k}</div>
                <div
                  className={`tabular-nums ${x.big ? "text-2xl font-semibold" : "text-lg font-medium"}`}
                >
                  {x.v}
                </div>
                <div className="text-muted-foreground text-[10px]">{x.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3">
          <TierRail card={card} tiers={MATRIX.tiers} />
        </div>
      </Card>

      {/* ---------- detail ---------- */}
      <Tabs defaultValue="scorecard" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="h-7 w-fit shrink-0">
          <TabsTrigger value="scorecard" className="h-6 text-[11px]">Scorecard</TabsTrigger>
          <TabsTrigger value="risk" className="h-6 text-[11px]">
            Risk{fatal.length > 0 && ` (${fatal.length})`}
          </TabsTrigger>
          <TabsTrigger value="actions" className="h-6 text-[11px]">
            Actions ({open.length + insights.corroboration.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="h-6 text-[11px]">History</TabsTrigger>
          <TabsTrigger value="assessment" className="h-6 text-[11px]">Assessment</TabsTrigger>
        </TabsList>

        {/* ---------------- scorecard: one worksheet ---------------- */}
        <TabsContent value="scorecard" className="min-h-0 flex-1 overflow-y-auto">
          <Panel>
            {/* qualification */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2.5">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
                Qualification
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

            {/* column header */}
            <div className={`${COLS} text-muted-foreground border-t bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase`}>
              <span />
              <span>Factor</span>
              <span>Basis in the record</span>
              <span>Evidence</span>
              <span>Sources</span>
              <span className="text-right">Pts</span>
              <span className="text-right">Adj</span>
            </div>

            {sections.map((sec) => {
              const rows = card.factors.filter((f) => f.section === sec);
              const subtotal = rows.reduce((n, f) => n + f.points, 0);
              return (
                <div key={sec}>
                  <SectionRow label={sec} points={subtotal} />
                  {rows.map((f) => (
                    <FactorRow key={f.key} f={f} />
                  ))}
                </div>
              );
            })}

            {/* totals */}
            <div className={`${COLS} border-t-2 bg-muted/60 px-4 py-2`}>
              <span />
              <span className="col-span-4 text-[11px] font-semibold tracking-[0.06em] uppercase">
                Matrix total
              </span>
              <span className="text-right text-[14px] font-bold tabular-nums">{card.points}</span>
              <span className="text-right text-[14px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {card.adjustedPoints}
              </span>
            </div>
            <div className={`${COLS} text-muted-foreground border-t px-4 py-1.5 text-[11px]`}>
              <span />
              <span className="col-span-4">
                {card.tier.label} on the matrix · {card.adjustedTier.label} on the evidence
              </span>
              <span className="text-right tabular-nums">{card.tier.label.replace("Tier ", "T")}</span>
              <span className="text-right tabular-nums">
                {card.adjustedTier.label.replace("Tier ", "T")}
              </span>
            </div>
          </Panel>
        </TabsContent>

        {/* ---------------- risk ---------------- */}
        <TabsContent value="risk" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2">
            <Panel>
              <Head title="What breaks this case" note="each factor struck, the file re-scored" />
              {fatal.length > 0 && (
                <div className="flex gap-2 border-b bg-orange-500/10 px-4 py-2 text-[11px] text-orange-900 dark:text-orange-300">
                  <ShieldAlert className="mt-px size-3.5 shrink-0" />
                  <span>{insights.subhead.split(".")[0]}. These are the records the defence attacks first.</span>
                </div>
              )}
              <div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_60px_60px_70px] gap-x-3 border-b bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase">
                <span>Factor</span>
                <span className="text-right">At risk</span>
                <span className="text-right">Score</span>
                <span className="text-right">Tier</span>
              </div>
              {fragility.map((f) => (
                <div
                  key={f.key}
                  className="grid grid-cols-[minmax(0,1fr)_60px_60px_70px] items-start gap-x-3 border-t px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{f.label}</div>
                    <div className="text-muted-foreground truncate text-[10px]">
                      {f.singleSource ? "One document · " : `${f.documents.length} documents · `}
                      {f.documents.join(" · ")}
                    </div>
                  </div>
                  <span className="text-right text-[12.5px] font-semibold tabular-nums text-orange-700">
                    −{f.pointsAtRisk}
                  </span>
                  <span className="text-right text-[12.5px] tabular-nums">{f.scoreIfStruck}</span>
                  <span
                    className={`text-right text-[11px] tabular-nums ${
                      f.dropsATier ? "font-semibold text-orange-700" : "text-muted-foreground"
                    }`}
                  >
                    {f.tierIfStruck}
                  </span>
                </div>
              ))}
            </Panel>

            <Panel>
              <Head title="The defence's case" note="assembled from your own file" />
              <div className="divide-y">
                {insights.defence.map((d, i) => (
                  <div key={i} className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          d.severity === "high" ? "bg-rose-600"
                          : d.severity === "medium" ? "bg-amber-500"
                          : "bg-slate-400"
                        }`}
                      />
                      <span className="truncate text-[12.5px] font-medium">{d.label}</span>
                      <span className="text-muted-foreground shrink-0 text-[10px] tracking-wide uppercase">
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
              <div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_54px_70px] gap-x-3 border-b bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase">
                <span>What is missing</span>
                <span className="text-right">Exp.</span>
                <span className="text-right">Best / worst</span>
              </div>
              {open.length === 0 && (
                <div className="text-muted-foreground px-4 py-6 text-center text-xs">
                  Every factor is resolved on the records in hand.
                </div>
              )}
              {open.map((f) => (
                <div key={f.key} className="border-t px-4 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_54px_70px] items-start gap-x-3">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{f.label}</div>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
                        {f.evidenceNeeded}
                      </p>
                    </div>
                    <span className="text-right text-[12.5px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      {f.expectedGain !== null ? num(f.expectedGain) : num(f.swing)}
                    </span>
                    <span className="text-muted-foreground text-right text-[11px] tabular-nums">
                      +{f.bestCase} / {f.worstCase}
                    </span>
                  </div>
                  {f.priorRationale && (
                    <p
                      className={`mt-1.5 rounded px-2 py-1 text-[11px] leading-snug ${
                        f.worstCase < 0
                          ? "bg-rose-500/10 text-rose-900 dark:text-rose-300"
                          : "bg-muted/60"
                      }`}
                    >
                      <span className="font-medium">
                        {f.worstCase < 0 && "This request can hurt you. "}
                        {Math.round((f.priorFavourable ?? 0) * 100)}% likely to help.
                      </span>{" "}
                      <span className="text-muted-foreground">{f.priorRationale}</span>
                    </p>
                  )}
                </div>
              ))}
            </Panel>

            <Panel>
              <Head title="Corroborate" note={`${insights.recoverable} points, no new facts required`} />
              <div className="border-b bg-muted/40 px-4 py-1.5 text-[11px] leading-snug">
                These facts are <span className="font-medium">already proved</span> — just not proved{" "}
                <span className="italic">well</span>. Nothing new has to be discovered; the file only has
                to be made harder to attack.
              </div>
              {insights.corroboration.map((c) => (
                <div
                  key={c.key}
                  className="grid grid-cols-[minmax(0,1fr)_44px_54px] items-start gap-x-3 border-t px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{c.label}</div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{c.reason}</p>
                    <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug">
                      <ArrowRight className="text-muted-foreground mt-[3px] size-3 shrink-0" />
                      {c.action}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-right text-[11px] tabular-nums">
                    {Math.round(c.strength * 100)}%
                  </span>
                  <span className="text-right text-[12.5px] font-semibold tabular-nums">
                    +{c.recoverable}
                  </span>
                </div>
              ))}
            </Panel>
          </div>
        </TabsContent>

        {/* ---------------- history ---------------- */}
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <Panel>
            <Head title="Score history" note="replayed in the order records were received" />
            <div className="text-muted-foreground grid grid-cols-[86px_minmax(0,1fr)_54px_54px_64px] gap-x-3 border-b bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase">
              <span>Received</span>
              <span>Document</span>
              <span className="text-right">Δ</span>
              <span className="text-right">Total</span>
              <span className="text-right">Tier</span>
            </div>
            {timeline.map((s) => (
              <div key={s.docId} className="border-t px-4 py-2">
                <div className="grid grid-cols-[86px_minmax(0,1fr)_54px_54px_64px] items-start gap-x-3">
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {s.received}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{s.facility}</div>
                    <div className="text-muted-foreground truncate text-[10px]">
                      {s.records} records
                      {s.changes.filter((c) => c.delta !== 0).length > 0 && " · "}
                      {s.changes
                        .filter((c) => c.delta !== 0)
                        .map((c) => `${c.label} ${num(c.delta)}`)
                        .join(" · ")}
                    </div>
                  </div>
                  <span
                    className={`text-right text-[12.5px] font-semibold tabular-nums ${
                      s.pointsDelta > 0 ? "text-emerald-700" : "text-muted-foreground/50"
                    }`}
                  >
                    {s.pointsDelta > 0 ? `+${s.pointsDelta}` : "—"}
                  </span>
                  <span className="text-right text-[12.5px] font-semibold tabular-nums">{s.points}</span>
                  <span
                    className={`text-right text-[11px] ${
                      s.tierChanged ? "font-semibold text-emerald-700" : "text-muted-foreground"
                    }`}
                  >
                    {s.tier.label}
                  </span>
                </div>
              </div>
            ))}
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
                  <TintBadge tone="orange">
                    {memo.ungrounded.length} figure(s) not in the scorecard
                  </TintBadge>
                ))}
            </div>
            <div className="px-4 py-3">
              {memo.state === "idle" && (
                <div className="text-muted-foreground py-10 text-center text-xs">
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
                <p className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-xs">
                  <Loader2 className="size-3.5 animate-spin" /> Drafting from the scorecard…
                </p>
              )}
              {memo.state === "error" && <p className="text-[12px] text-orange-700">{memo.message}</p>}
              {memo.state === "done" && (
                <div className="max-w-3xl">
                  {!memo.verified && (
                    <p className="mb-3 rounded bg-orange-500/10 px-2 py-1.5 text-[11px] text-orange-900 dark:text-orange-300">
                      These figures appear in the memo but not in the scorecard, and should not be relied
                      on: {memo.ungrounded.join(", ")}
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
