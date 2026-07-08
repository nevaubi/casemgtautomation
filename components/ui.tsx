"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Routing, routingLabel } from "@/lib/demo";

export const ROUTING_FILL: Record<Routing, string> = {
  auto: "var(--ok)",
  review: "var(--warn)",
  escalated: "var(--escal)",
  negated: "var(--quiet)",
};

/** Status as dot + mono text — no pill fills, template-quiet. */
export function DotLabel({
  color,
  children,
  strong = false,
}: {
  color: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <span className="dotlabel" style={{ color: strong ? "var(--black)" : "var(--gray-600)" }}>
      <span className="dot" style={{ background: color }} />
      {children}
    </span>
  );
}

export function RoutingLabel({ routing }: { routing: Routing }) {
  return <DotLabel color={ROUTING_FILL[routing]}>{routingLabel[routing].toLowerCase()}</DotLabel>;
}

export function StatusLabel({ status }: { status: string }) {
  const color =
    status === "Auto-Processed" ? "var(--ok)"
    : status === "Needs Review" ? "var(--warn)"
    : "var(--quiet)";
  return <DotLabel color={color}>{status.toLowerCase()}</DotLabel>;
}

/** Confidence meter with the 85% auto-accept threshold tick. */
export function ConfMeter({ value, routing }: { value: number; routing: Routing }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="meter">
        <span
          className="meter-fill"
          style={{ width: `${Math.round(value * 100)}%`, background: ROUTING_FILL[routing] }}
        />
        <span className="meter-tick" style={{ left: "85%" }} />
      </span>
      <span className="meta tabular-nums" style={{ color: "var(--black)", minWidth: 32 }}>
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
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-[64ch]">
        {overline && <div className="meta-label mb-2">{overline}</div>}
        <h1 className="text-3xl leading-tight" style={{ color: "var(--black)" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--gray-500)" }}>
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
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
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-lg"
      style={{ background: "rgba(255,255,255,0.85)", borderBottom: "1px solid var(--gray-200)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1408px] items-center gap-8 px-8">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--black)" }}>
            Seeger Weiss
          </span>
          <span className="meta">/ case automation</span>
        </Link>

        <nav className="hidden md:block">
          <ul role="list" className="flex items-center gap-6">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={`navlink ${active(n.href) ? "on" : ""}`}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <span
            className="hidden h-5 w-px sm:block"
            style={{ background: "var(--gray-200)" }}
            aria-hidden
          />
          <DotLabel color="var(--warn)">simulated litify env</DotLabel>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-medium text-white"
            style={{ background: "var(--black)" }}
            title="Ops Reviewer (demo)"
          >
            OP
          </span>
        </div>
      </div>
    </header>
  );
}
