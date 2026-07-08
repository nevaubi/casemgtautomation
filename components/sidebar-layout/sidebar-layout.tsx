"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "13rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden">
        <AppHeader />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:overflow-hidden">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
