"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Routing, routingColor, routingLabel } from "@/lib/demo";

export function RoutingChip({ routing }: { routing: Routing }) {
  return <span className={`chip chip-${routing}`}>{routingLabel[routing]}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const cls = status === "Auto-Processed" ? "chip-auto"
    : status === "Needs Review" ? "chip-review" : "chip-neutral";
  return <span className={`chip ${cls}`}>{status}</span>;
}

export function ConfBar({ value, routing }: { value: number; routing: Routing }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="confbar" style={{ width: 54 }}>
        <span
          className="block h-full"
          style={{ width: `${Math.round(value * 100)}%`, background: routingColor[routing] }}
        />
      </span>
      <span className="tabular-nums text-[11.5px] font-semibold" style={{ color: routingColor[routing] }}>
        {(value * 100).toFixed(0)}%
      </span>
    </span>
  );
}

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/worklist", label: "Work List" },
  { href: "/review", label: "Review Queue" },
  { href: "/litify", label: "Litify Sync" },
];

export function TopNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--sw-navy)" }}>
      <div className="flex items-stretch h-[52px] px-4">
        <Link href="/" className="flex items-center gap-3 pr-5 mr-1"
          style={{ borderRight: "1px solid rgba(255,255,255,0.15)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seegerweiss.png" alt="Seeger Weiss LLP" className="h-[30px] w-auto" />
          <span className="hidden md:flex flex-col leading-tight">
            <span className="text-white text-[12px] font-semibold tracking-wide">
              Case Management Automation
            </span>
            <span className="text-[10px]" style={{ color: "var(--sw-steel)" }}>
              Litify Document Intelligence &middot; Prototype
            </span>
          </span>
        </Link>
        <nav className="flex items-stretch">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={`navlink ${path === n.href ? "active" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="chip" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
            SIMULATED LITIFY CONNECTION
          </span>
          <span className="hidden sm:flex items-center gap-2 text-[12px] text-white/90 font-medium">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: "var(--sw-steel)", color: "var(--sw-navy-ink)" }}>
              OP
            </span>
            Ops Reviewer
          </span>
        </div>
      </div>
    </header>
  );
}
