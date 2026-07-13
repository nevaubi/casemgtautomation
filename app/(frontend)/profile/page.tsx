"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle, Download, FileText, Loader2, ScanLine, XCircle,
} from "lucide-react";

import { Decision, getManifest, logAuditEvent, Manifest, Routing } from "@/lib/demo";
import { CaseRecord, loadDocRecords, recordProfileDecision } from "@/lib/records";
import {
  buildCaseProfile, CaseProfile, Citation, Conflict, forExport,
} from "@/lib/case-profile";
import {
  ConfMeter, DecisionBadge, PageHeader, RoutingBadge, TintBadge,
} from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ *
 * Every fact on this page is a claim with a receipt. These three small
 * components are the receipt: where it came from, how sure we are, and
 * whether a human has signed off on it.
 * ------------------------------------------------------------------ */

function Sources({ citations }: { citations: Citation[] }) {
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
              {c.docTitle} · p.{c.page} · {(c.confidence * 100).toFixed(0)}% ·{" "}
              {c.source === "ocr" ? "OCR" : "text layer"} · model certainty {c.certainty}
              {c.reportedBy ? ` · reported by ${c.reportedBy}` : ""}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function Conflicts({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {conflicts.map((c, i) => (
        <div
          key={i}
          className="flex gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-px size-3 shrink-0" />
          <span>
            <span className="font-medium">{c.label} — sources differ.</span>{" "}
            {c.values.map((v, j) => (
              <span key={j}>
                {j > 0 && <span className="opacity-50"> vs </span>}
                “{v.value}” <span className="opacity-60">({v.docTitle.split(/[ —-]/).slice(0, 2).join(" ")} p.{v.page})</span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

type Entry = {
  key: string;
  citations: Citation[];
  routing: Exclude<Routing, "negated">;
  weakestRouting: Exclude<Routing, "negated">;
  confidence: number;
  decision: Decision;
  conflicts: Conflict[];
  hearsayOnly: boolean;
};

function Verdict({
  entry, label, pending, onDecide,
}: {
  entry: Entry;
  label: string;
  pending: string | null;
  onDecide: (e: Entry, d: Exclude<Decision, null>, label: string) => void;
}) {
  const busy = pending === entry.key;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {entry.hearsayOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span><TintBadge tone="slate">2nd-hand</TintBadge></span>
          </TooltipTrigger>
          <TooltipContent>Every source for this field is patient-reported or an outside record.</TooltipContent>
        </Tooltip>
      )}
      <ConfMeter value={entry.confidence} routing={entry.routing} />
      {entry.decision ? (
        <DecisionBadge decision={entry.decision} />
      ) : entry.routing === "auto" ? (
        <RoutingBadge routing="auto" />
      ) : (
        <RoutingBadge routing={entry.routing} />
      )}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon" className="size-6"
              disabled={busy} onClick={() => onDecide(entry, "approved", label)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Approve for the fact sheet</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon" className="size-6"
              disabled={busy} onClick={() => onDecide(entry, "rejected", label)}
            >
              <XCircle className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reject — excluded from the fact sheet</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function Section({
  title, note, children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 self-start rounded-lg py-0 shadow-none">
      <div className="flex items-baseline gap-2 border-b px-4 py-2.5">
        <span className="text-[13px] font-semibold">{title}</span>
        {note && <span className="text-muted-foreground text-[11px]">{note}</span>}
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-2.5">{children}</div>
);

/* ------------------------------------------------------------------ */

export default function CaseProfilePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [records, setRecords] = useState<Map<string, CaseRecord[]> | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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

  const profile: CaseProfile | null = useMemo(
    () => (manifest && records ? buildCaseProfile(manifest, records) : null),
    [manifest, records]
  );

  /** A decision on a profile field writes through to every record backing it. */
  const decide = async (entry: Entry, decision: Exclude<Decision, null>, label: string) => {
    setPending(entry.key);
    const ids = entry.citations.map((c) => c.recordId);
    await recordProfileDecision(ids, decision, `Case profile — ${label} ${decision}`);
    setRecords((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      for (const [docId, recs] of next) {
        next.set(
          docId,
          recs.map((r) => (ids.includes(r.id) ? { ...r, decision } : r))
        );
      }
      return next;
    });
    setPending(null);
  };

  const exportDocx = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      const res = await fetch("/api/case-profile/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forExport(profile)),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Plaintiff-Fact-Sheet-Draft-${profile.matter.litifyMatterNumber}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      await logAuditEvent(
        "profile.exported",
        null,
        `Draft Plaintiff Fact Sheet exported — ${profile.totals.records} records, ` +
          `${profile.totals.rejected} rejected, ${profile.totals.conflicts} unresolved conflicts`
      );
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

  const t = profile.totals;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={`${profile.matter.litifyMatterNumber} · ${t.records} records extracted from ${t.documents} documents by ${profile.model}`}
        title="Case profile — draft Plaintiff Fact Sheet"
        description="Every field is extracted, grounded in a verbatim quote, and cited. Nothing is inferred; nothing rejected is exported."
      >
        {t.conflicts > 0 && (
          <TintBadge tone="amber">
            {t.conflicts} conflict{t.conflicts === 1 ? "" : "s"}
          </TintBadge>
        )}
        <TintBadge tone={t.fieldsNeedingReview > 0 ? "orange" : "emerald"}>
          {t.fieldsNeedingReview} of {t.fields} fields need review
        </TintBadge>
        <Button size="sm" onClick={exportDocx} disabled={exporting}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export fact sheet (.docx)
        </Button>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pb-1 xl:grid-cols-2">
        {/* 1 — Plaintiff identity */}
        <Section title="1 · Plaintiff identity & history" note="one row per PFS field">
          {profile.demographics.map((d) => (
            <Row key={d.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    {d.field}
                  </div>
                  <div className="text-[13px] font-medium">{d.value || "—"}</div>
                </div>
                <Verdict entry={d} label={d.field} pending={pending} onDecide={decide} />
              </div>
              <Conflicts conflicts={d.conflicts} />
              <div className="mt-1.5">
                <Sources citations={d.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 2 — Exposure */}
        <Section title="2 · Exposure & medication history" note="deduplicated across every document">
          {profile.exposures.map((e) => (
            <Row key={e.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{e.drug}</div>
                  <div className="text-muted-foreground mt-0.5 space-y-0.5 text-[11px]">
                    <div>
                      {[e.doses[0], e.routes[0], e.regimens[0]].filter(Boolean).join(" · ") ||
                        "Regimen not stated"}
                      {e.ndc && <span className="ml-1 font-mono opacity-70">NDC {e.ndc}</span>}
                    </div>
                    <div>
                      {e.administrationCount > 0 ? (
                        <>
                          <span className="text-foreground font-medium">
                            {e.administrationCount} documented administration
                            {e.administrationCount === 1 ? "" : "s"}
                          </span>{" "}
                          {e.firstAdministered} → {e.lastAdministered}
                        </>
                      ) : e.firstDocumented ? (
                        <>First documented {e.firstDocumented}</>
                      ) : (
                        <>No start date stated in the records</>
                      )}
                      {e.discontinued && <> · discontinued {e.discontinued}</>}
                      {e.fills.length > 0 && (
                        <> · {e.fills.length} pharmacy fill{e.fills.length === 1 ? "" : "s"} ({e.fills[0]}
                          {e.fills.length > 1 && <> – {e.fills[e.fills.length - 1]}</>})
                        </>
                      )}
                    </div>
                    {e.prescribers.length > 0 && <div>Prescriber: {e.prescribers[0]}</div>}
                  </div>
                </div>
                <Verdict entry={e} label={`Exposure — ${e.drug}`} pending={pending} onDecide={decide} />
              </div>
              <Conflicts conflicts={e.conflicts} />
              <div className="mt-1.5">
                <Sources citations={e.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 3 — Administration log */}
        <Section
          title="3 · Administration log"
          note="one row per dose actually documented as given"
        >
          {profile.administrations.map((a) => (
            <Row key={a.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px]">
                    <span className="font-mono font-medium">{a.date || "undated"}</span>
                    <span className="ml-2">{a.drug}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">
                    {[a.dose, a.route, a.site, a.lot && `lot ${a.lot}`, a.administeredBy]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Verdict
                  entry={a}
                  label={`Administration — ${a.drug} ${a.date}`}
                  pending={pending}
                  onDecide={decide}
                />
              </div>
              <Conflicts conflicts={a.conflicts} />
              <div className="mt-1.5">
                <Sources citations={a.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 4 — Diagnoses */}
        <Section title="4 · Diagnosis timeline" note="earliest documented occurrence first">
          {profile.diagnoses.map((d) => (
            <Row key={d.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">
                    {d.condition}
                    {d.icd10 && (
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                        {d.icd10}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 space-y-0.5 text-[11px]">
                    <div>
                      {d.firstDocumented ? `First documented ${d.firstDocumented}` : "Date not stated"}
                      {d.diagnosedBy && <> · {d.diagnosedBy}</>}
                      {d.status && <> · {d.status}</>}
                    </div>
                    {d.confirmingTest && (
                      <div className="text-foreground/80">Confirmed by: {d.confirmingTest}</div>
                    )}
                  </div>
                </div>
                <Verdict entry={d} label={`Diagnosis — ${d.condition}`} pending={pending} onDecide={decide} />
              </div>
              <Conflicts conflicts={d.conflicts} />
              <div className="mt-1.5">
                <Sources citations={d.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 5 — Causation */}
        <Section
          title="5 · Causation evidence"
          note="explicit clinician statements only — verbatim"
        >
          {profile.causation.length === 0 && (
            <div className="text-muted-foreground px-4 py-6 text-center text-xs">
              No clinician causation statement found in this document set.
            </div>
          )}
          {profile.causation.map((c) => (
            <Row key={c.key}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[12.5px] italic">“{c.statement}”</p>
                <Verdict entry={c} label="Causation statement" pending={pending} onDecide={decide} />
              </div>
              <div className="text-muted-foreground mt-1 text-[11px]">
                — {c.author ?? "unattributed"}
                {c.date && <>, {c.date}</>}
                {c.relationship && <> · characterised as: {c.relationship}</>}
              </div>
              <div className="mt-1.5">
                <Sources citations={c.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 6 — Treatments */}
        <Section title="6 · Treatment & diagnostics" note="procedures, imaging, and results">
          {profile.treatments.map((tr) => (
            <Row key={tr.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px]">
                    <span className="font-mono font-medium">{tr.date ?? "undated"}</span>
                    <span className="ml-2 font-medium">{tr.intervention}</span>
                    {tr.cpt && (
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                        CPT {tr.cpt}
                      </span>
                    )}
                  </div>
                  {tr.result && (
                    <div className="text-muted-foreground mt-0.5 text-[11px]">{tr.result}</div>
                  )}
                </div>
                <Verdict entry={tr} label={`Treatment — ${tr.intervention}`} pending={pending} onDecide={decide} />
              </div>
              <div className="mt-1.5">
                <Sources citations={tr.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 7 — Providers */}
        <Section title="7 · Providers & facilities" note="extracted from the records, not the file list">
          {profile.providers.map((p) => (
            <Row key={p.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">
                    {p.name}
                    {p.credential && <span className="text-muted-foreground">, {p.credential}</span>}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">
                    {[p.specialty, p.facility, p.role].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Verdict entry={p} label={`Provider — ${p.name}`} pending={pending} onDecide={decide} />
              </div>
              <div className="mt-1.5">
                <Sources citations={p.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 8 — Ruled out */}
        <Section
          title="8 · Denied & ruled out"
          note="negative findings — kept, because the defence will use them"
        >
          {profile.ruledOut.map((r) => (
            <Row key={r.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{r.condition}</div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">
                    {r.date && <span className="font-mono">{r.date}</span>}
                    {r.note && <> · {r.note}</>}
                  </div>
                </div>
                <Verdict entry={r} label={`Ruled out — ${r.condition}`} pending={pending} onDecide={decide} />
              </div>
              <div className="mt-1.5">
                <Sources citations={r.citations} />
              </div>
            </Row>
          ))}
        </Section>

        {/* 9 — Sources */}
        <Section title="9 · Source documents" note={`${t.auto} auto · ${t.review} review · ${t.escalated} escalated`}>
          {profile.sourceDocuments.map((d) => (
            <Link
              key={d.id}
              href={`/workbench/${d.id}`}
              className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="text-muted-foreground size-3.5 shrink-0" />
                <span className="min-w-0 truncate text-[13px]">{d.facility}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                {d.records} records · {d.pages}pp
              </span>
            </Link>
          ))}
        </Section>
      </div>
    </div>
  );
}
