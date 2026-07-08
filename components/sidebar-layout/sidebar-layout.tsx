"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className="flex flex-1 flex-col gap-6 p-4 pt-2 md:p-6 md:pt-3">
          {children}
        </main>
        <footer className="text-muted-foreground border-t px-4 py-4 text-xs md:px-6">
          Prototype · simulated Litify connection · synthetic records only — every patient and
          provider is fictional · pipeline v0.1.0
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
