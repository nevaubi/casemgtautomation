"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, PanelsTopLeft } from "lucide-react";

import { getManifest, Manifest, pct } from "@/lib/demo";
import { PageHeader, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FILTERS = [
  { value: "All", label: "All" },
  { value: "Auto-Processed", label: "Auto-processed" },
  { value: "Needs Review", label: "Needs review" },
];

export default function Worklist() {
  const [m, setM] = useState<Manifest | null>(null);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  useEffect(() => { getManifest().then(setM); }, []);

  const rows = useMemo(() => {
    if (!m) return [];
    return m.documents.filter((d) => {
      if (filter !== "All" && d.status !== filter) return false;
      return `${d.title} ${d.facility} ${d.docType}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [m, filter, q]);

  if (!m) return <Skeleton className="mt-3 h-[80%] w-full" />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Work list"
        description="Every document pulled for this matter, with pipeline results and routing."
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter documents…"
          className="h-8 w-52 text-sm"
        />
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="h-8">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="px-2.5 text-xs">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 px-4 font-medium">Document</TableHead>
                <TableHead className="h-10 px-4 font-medium">Type</TableHead>
                <TableHead className="h-10 px-4 text-right font-medium">Pages</TableHead>
                <TableHead className="h-10 px-4 text-right font-medium">OCR conf</TableHead>
                <TableHead className="h-10 px-4 font-medium">Findings</TableHead>
                <TableHead className="h-10 w-[130px] px-4 font-medium">Status</TableHead>
                <TableHead className="h-10 w-[90px] px-4 font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} className="hover:bg-muted/50">
                  <TableCell className="max-w-[340px] px-4 py-2.5">
                    <Link href={`/workbench/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 truncate text-xs">
                      {d.facility} · received {d.received} ·{" "}
                      <span className="font-mono text-[11px]">{d.sfContentVersionId}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-2.5 text-sm">
                    {d.docType}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right tabular-nums">
                    {d.pages}
                    {d.ocrPages > 0 && (
                      <span className="text-muted-foreground text-[11px]"> ({d.ocrPages} OCR)</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right tabular-nums">
                    {pct(d.meanOcrConf)}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2.5 text-sm tabular-nums">
                      <span title="Auto-accepted" className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-600" />
                        {d.counts.auto}
                      </span>
                      <span title="Flagged for review" className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {d.counts.review + d.counts.escalated}
                      </span>
                      <span title="Negated context" className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-slate-400" />
                        {d.counts.negated}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="size-7" asChild>
                            <Link href={`/workbench/${d.id}`} aria-label="Open workbench">
                              <PanelsTopLeft className="size-3.5" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open workbench</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="size-7" asChild>
                            <a
                              href={d.enrichedPdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open enriched PDF"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Enriched PDF</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-28 px-4 text-center">
                    No documents match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      </Card>
    </div>
  );
}
