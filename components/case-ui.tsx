"use client";

import { Badge } from "@/components/ui/badge";
import { Routing, routingLabel } from "@/lib/demo";

/** Tailwind color classes for routing dots / meter fills. */
export const ROUTING_DOT: Record<Routing, string> = {
  auto: "bg-emerald-600",
  review: "bg-amber-500",
  escalated: "bg-orange-600",
  negated: "bg-slate-400",
};

/* Soft tinted chips — borderless, enterprise-CRM style. */
const TINT = {
  emerald:
    "border-0 bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "border-0 bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  orange: "border-0 bg-orange-500/15 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  rose: "border-0 bg-rose-500/15 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  blue: "border-0 bg-blue-500/15 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  slate: "border-0 bg-slate-500/15 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
} as const;

const ROUTING_TINT: Record<Routing, string> = {
  auto: TINT.emerald,
  review: TINT.amber,
  escalated: TINT.orange,
  negated: TINT.slate,
};

export function RoutingBadge({ routing }: { routing: Routing }) {
  return <Badge className={`${ROUTING_TINT[routing]} h-5 px-1.5 text-[11px]`}>{routingLabel[routing]}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tint =
    status === "Auto-Processed" || status === "Reviewed" || status === "Written Back"
      ? TINT.emerald
      : status === "Needs Review"
        ? TINT.amber
        : TINT.slate;
  return <Badge className={`${tint} h-5 px-1.5 text-[11px]`}>{status}</Badge>;
}

export function DecisionBadge({ decision }: { decision: string }) {
  const tint =
    decision === "approved" ? TINT.emerald
    : decision === "rejected" ? TINT.rose
    : decision === "corrected" ? TINT.blue
    : TINT.orange;
  return <Badge className={`${tint} h-5 px-1.5 text-[11px] capitalize`}>{decision}</Badge>;
}

export function TintBadge({
  tone,
  children,
}: {
  tone: keyof typeof TINT;
  children: React.ReactNode;
}) {
  return <Badge className={`${TINT[tone]} h-5 px-1.5 text-[11px]`}>{children}</Badge>;
}

/** Compact confidence meter with a tick at the 85% auto-accept threshold. */
export function ConfMeter({ value, routing }: { value: number; routing: Routing }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="bg-muted relative inline-block h-1 w-14 rounded-full">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${ROUTING_DOT[routing]}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
        <span className="bg-foreground/30 absolute -inset-y-[3px] left-[85%] w-px" />
      </span>
      <span className="text-muted-foreground w-7 text-[11px] font-medium tabular-nums">
        {(value * 100).toFixed(0)}%
      </span>
    </span>
  );
}

/** Compact page header: one dense row of context + actions. */
export function PageHeader({
  overline,
  title,
  description,
  children,
}: {
  overline?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 py-2.5">
      <div className="min-w-0">
        {overline && (
          <div className="text-muted-foreground/80 mb-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
            {overline}
          </div>
        )}
        <h1 className="text-[17px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 pb-0.5">{children}</div>}
    </div>
  );
}
