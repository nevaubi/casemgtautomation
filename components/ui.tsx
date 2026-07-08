"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Routing, routingLabel } from "@/lib/demo";

/* Routing → badge variant. Status colors appear only through this component
   (and the meter fill), keeping the rest of the interface to one accent. */
const ROUTING_VARIANT: Record<Routing, string> = {
  auto: "badge-ok",
  review: "badge-warn",
  escalated: "badge-alert",
  negated: "badge-quiet",
};

export const ROUTING_FILL: Record<Routing, string> = {
  auto: "var(--ok)",
  review: "var(--warn)",
  escalated: "var(--alert)",
  negated: "var(--quiet)",
};

export function RoutingBadge({ routing }: { routing: Routing }) {
  return (
    <span className={`badge ${ROUTING_VARIANT[routing]}`}>
      <span className="dot" />
      {routingLabel[routing]}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Auto-Processed" ? "badge-ok"
    : status === "Needs Review" ? "badge-warn"
    : "badge-quiet";
  return (
    <span className={`badge ${variant}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

/** Confidence meter with the 85% auto-accept threshold tick. */
export function ConfMeter({
  value,
  routing,
  showValue = true,
}: {
  value: number;
  routing: Routing;
  showValue?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="meter">
        <span
          className="meter-fill"
          style={{ width: `${Math.round(value * 100)}%`, background: ROUTING_FILL[routing] }}
        />
        <span className="meter-tick" style={{ left: "85%" }} />
      </span>
      {showValue && (
        <span
          className="text-[12px] font-medium tabular-nums"
          style={{ color: "var(--muted)", minWidth: 30 }}
        >
          {(value * 100).toFixed(0)}%
        </span>
      )}
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
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1">
      <div className="min-w-0">
        {overline && <div className="ovl mb-1">{overline}</div>}
        <h1 className="text-[19px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
          {title}
        </h1>
        {description && (
          <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/worklist", label: "Work list" },
  { href: "/review", label: "Review queue" },
  { href: "/litify", label: "Litify sync" },
];

export function TopNav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-stretch px-6">
        <Link href="/" className="flex items-center gap-3 pr-6">
          <span
            className="font-serif-brand text-[16px] font-semibold tracking-[0.02em]"
            style={{ color: "var(--brand)" }}
          >
            Seeger&thinsp;Weiss
            <span className="ml-1 text-[10px] font-medium tracking-[0.12em] align-top"
              style={{ color: "var(--faint)" }}>LLP</span>
          </span>
          <span aria-hidden className="h-5 w-px" style={{ background: "var(--line-strong)" }} />
          <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
            Case Automation
          </span>
        </Link>

        <nav className="hidden md:flex items-stretch">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`navtab ${active(n.href) ? "on" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="badge badge-outline">
            <span className="dot" style={{ background: "var(--warn)" }} />
            Simulated Litify environment
          </span>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: "var(--brand-wash)", color: "var(--brand)" }}
            title="Ops Reviewer (demo)"
          >
            OP
          </span>
        </div>
      </div>
    </header>
  );
}
