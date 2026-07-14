"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Files,
  LayoutDashboard,
  NotebookText,
  RefreshCw,
  Scale,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

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
  { title: "Upload & process", url: "/upload", icon: UploadCloud },
  { title: "Review queue", url: "/review", icon: ClipboardCheck },
  { title: "Case profile", url: "/profile", icon: NotebookText },
  { title: "Settlement grid", url: "/grid", icon: Scale },
  { title: "Litify sync", url: "/litify", icon: RefreshCw },
];

const itemCls =
  "h-7 gap-2 rounded-md px-2 text-[13px] font-normal text-white/80 " +
  "hover:bg-white/10 hover:text-white " +
  "data-[active=true]:bg-white/14 data-[active=true]:font-medium data-[active=true]:text-white " +
  "[&>svg]:size-3.5 [&>svg]:text-white/60 data-[active=true]:[&>svg]:text-white";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-2 pt-2.5 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="h-10 gap-2 px-1.5 hover:bg-white/10">
              <Link href="/">
                <div className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-md bg-white/12 font-serif text-[11px] font-bold tracking-tight text-white">
                  SW
                </div>
                <div className="grid flex-1 text-left leading-none">
                  <span className="truncate font-serif text-[13px] font-bold tracking-wide text-white">
                    SEEGER<span className="font-normal">WEISS</span>
                    <span className="ml-1 align-middle text-[8px] font-semibold tracking-[0.14em] text-white/60">
                      LLP
                    </span>
                  </span>
                  <span className="mt-1 truncate text-[10px] tracking-wide text-white/50">
                    Case Automation
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 px-2 text-[10px] font-medium tracking-[0.08em] text-white/40 uppercase">
            Records review
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={itemCls}
                  >
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

        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 px-2 text-[10px] font-medium tracking-[0.08em] text-white/40 uppercase">
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Admin (Payload CMS)" className={itemCls}>
                  <a href="/admin" target="_blank" rel="noopener noreferrer">
                    <ShieldCheck />
                    <span>Admin</span>
                  </a>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] text-white/40">↗</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-2.5">
        <div className="grid gap-0.5 text-[10px] leading-snug text-white/45 group-data-[collapsible=icon]:hidden">
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-amber-400" />
            Simulated Litify environment
          </span>
          <span>Synthetic records only · v0.1.0</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
