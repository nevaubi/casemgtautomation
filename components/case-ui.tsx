"use client";

import { Badge } from "@/components/ui/badge";
import { Routing, routingLabel } from "@/lib/demo";

/** Tailwind color classes for routing dots / fills (single source of truth). */
export const ROUTING_DOT: Record<Routing, string> = {
  auto: "bg-status-ok",
  review: "bg-status-warn",
  escalated: "bg-status-alert",
  negated: "bg-status-quiet",
};

export function RoutingBadge({ routing }: { routing: Routing }) {
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1.5 font-normal">
      <span className={`size-1.5 rounded-full ${ROUTING_DOT[routing]}`} />
      {routingLabel[routing]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const dot =
    status === "Auto-Processed" ? "bg-status-ok"
    : status === "Needs Review" ? "bg-status-warn"
    : "bg-status-quiet";
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1.5 font-normal">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  return <Badge variant="secondary" className="capitalize">{decision}</Badge>;
}

/** Confidence meter with a tick at the 85% auto-accept threshold. */
export function ConfMeter({ value, routing }: { value: number; routing: Routing }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="bg-muted relative inline-block h-1.5 w-16 rounded-full">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${ROUTING_DOT[routing]}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
        <span className="bg-foreground/30 absolute -inset-y-0.5 left-[85%] w-px" />
      </span>
      <span className="text-muted-foreground w-8 text-xs font-medium tabular-nums">
        {(value * 100).toFixed(0)}%
      </span>
    </span>
  );
}

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
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        {overline && (
          <div className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {overline}
          </div>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
