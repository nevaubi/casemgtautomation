"use client";

import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: [string, string][] = [
  ["/worklist", "Work list"],
  ["/upload", "Upload & process"],
  ["/workbench", "Workbench"],
  ["/review", "Review queue"],
  ["/litify", "Litify sync"],
];

export function AppHeader() {
  const pathname = usePathname();
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Dashboard";

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="text-muted-foreground -ml-1 size-7" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-3.5" />
        <div className="text-[13px] font-medium">{title}</div>
      </div>
      <div className="ml-auto flex items-center gap-2.5 px-4">
        <Badge
          variant="outline"
          className="text-muted-foreground hidden h-5 gap-1.5 px-1.5 text-[11px] font-normal sm:inline-flex"
        >
          <span className="size-1 rounded-full bg-amber-500" />
          Simulated Litify
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
          >
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">OP</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">Ops Reviewer</div>
              <div className="text-muted-foreground text-xs">demo session</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<a href="/admin" target="_blank" rel="noopener noreferrer" />}
            >
              Open admin (Payload)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
