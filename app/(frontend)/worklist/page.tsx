"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { getManifest, Manifest, pct } from "@/lib/demo";
import { PageHeader, StatusBadge } from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  if (!m) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Work list"
        description="Every document pulled for this matter, with pipeline results and routing."
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter documents…"
          className="w-56"
        />
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <Card className="min-w-0 shadow-none">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead className="text-right">OCR conf</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-96">
                    <Link href={`/workbench/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {d.facility} · received {d.received}
                    </div>
                    <div className="text-muted-foreground/70 mt-1 font-mono text-xs">
                      {d.sfContentDocumentId} · {d.sfContentVersionId}
                    </div>
                  </TableCell>
                  <TableCell>{d.docType}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.pages}
                    {d.ocrPages > 0 && (
                      <span className="text-muted-foreground text-xs"> ({d.ocrPages} OCR)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(d.meanOcrConf)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-3 text-sm tabular-nums">
                      <span title="Auto-accepted" className="inline-flex items-center gap-1.5">
                        <span className="bg-status-ok size-1.5 rounded-full" />
                        {d.counts.auto}
                      </span>
                      <span title="Flagged for review" className="inline-flex items-center gap-1.5">
                        <span className="bg-status-warn size-1.5 rounded-full" />
                        {d.counts.review + d.counts.escalated}
                      </span>
                      <span title="Negated context" className="inline-flex items-center gap-1.5">
                        <span className="bg-status-quiet size-1.5 rounded-full" />
                        {d.counts.negated}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <Button size="sm" asChild>
                        <Link href={`/workbench/${d.id}`}>Open workbench</Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={d.enrichedPdf} target="_blank" rel="noopener noreferrer">
                          PDF <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                    No documents match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
