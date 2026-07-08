"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Files, LayoutDashboard, RefreshCw, ShieldCheck } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAV = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Work list", url: "/worklist", icon: Files },
  { title: "Review queue", url: "/review", icon: ClipboardCheck },
  { title: "Litify sync", url: "/litify", icon: RefreshCw },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent/60">
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-white/10 font-serif text-sm font-bold tracking-tight text-white">
                  SW
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-serif text-[15px] font-bold tracking-wide text-white">
                    SEEGER<span className="font-normal">WEISS</span>
                    <span className="ml-1 align-middle text-[9px] font-semibold tracking-widest text-white/70">
                      LLP
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-white/60">Case Automation</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-white/50">Records review</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-white/50">System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Admin (Payload CMS)">
                  <a href="/admin" target="_blank" rel="noopener noreferrer">
                    <ShieldCheck />
                    <span>Admin</span>
                  </a>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-white/50">↗</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="grid gap-1 px-2 py-1.5 text-[11px] leading-tight text-white/55 group-data-[collapsible=icon]:hidden">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-400" />
            Simulated Litify environment
          </span>
          <span>Synthetic records only · pipeline v0.1.0</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
