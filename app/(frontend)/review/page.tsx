"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import { ConfMeter, DecisionBadge, PageHeader, RoutingBadge } from "@/components/case-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface QueueItem { doc: DocMeta; f: Finding; key: string }

export default function ReviewQueue() {
  const [m, setM] = useState<Manifest | null>(null);
  const [all, setAll] = useState<QueueItem[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const man = await getManifest();
      setM(man);
      const items: QueueItem[] = [];
      for (const doc of man.documents) {
        const findings = await loadDocFindings(doc);
        for (const f of findings) {
          if (f.routing === "review" || f.routing === "escalated") {
            items.push({ doc, f, key: `${doc.id}:${f.idx}` });
          }
        }
      }
      items.sort((a, b) => a.f.confidence - b.f.confidence);
      setAll(items);
    })();
  }, []);

  const remaining = useMemo(() => all.filter((i) => !i.f.decision), [all]);
  const resolved = useMemo(() => all.filter((i) => i.f.decision), [all]);

  const act = async (item: QueueItem, decision: Exclude<Decision, null>) => {
    setSaving(item.key);
    setAll((prev) =>
      prev.map((x) => (x.key === item.key ? { ...x, f: { ...x.f, decision } } : x))
    );
    await recordDecision(item.doc.id, item.f.idx, decision);
    setSaving(null);
  };

  if (!m) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Review queue"
        description="Findings the pipeline wasn’t confident enough to accept, lowest confidence first. Decisions persist and feed threshold tuning."
      >
        <Badge variant="outline" className="gap-1.5">
          <span className="bg-status-warn size-1.5 rounded-full" />
          {remaining.length} awaiting
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <span className="bg-status-ok size-1.5 rounded-full" />
          {resolved.length} resolved
        </Badge>
      </PageHeader>

      <Card className="min-w-0 shadow-none">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Finding</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="max-w-72">Evidence</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((item) => {
                const { doc, f, key } = item;
                return (
                  <TableRow key={key} className={f.decision ? "opacity-50" : undefined}>
                    <TableCell className="max-w-72">
                      <div className="font-medium">{f.term_label}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        Matched “{f.variant}” — compound {pct(f.confidence)} (match{" "}
                        {pct(f.match_quality)} × OCR {pct(f.ocr_conf)}
                        {f.source === "ocr" ? ", scanned page" : ""})
                      </div>
                      <div className="mt-1.5"><RoutingBadge routing={f.routing} /></div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/workbench/${doc.id}`} className="font-medium hover:underline">
                        {doc.docType}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        Page {f.page} · {f.source === "ocr" ? "OCR" : "text layer"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <span className="text-muted-foreground text-xs italic">…{f.evidence}…</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ConfMeter value={f.confidence} routing={f.routing} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {f.decision ? (
                        <DecisionBadge decision={f.decision} />
                      ) : saving === key ? (
                        <span className="text-muted-foreground text-xs">Saving…</span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" onClick={() => act(item, "approved")}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => act(item, "corrected")}>
                            Correct
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => act(item, "escalated")}>
                            Escalate
                          </Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {all.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                    Queue is empty — every finding cleared the auto-accept threshold.
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
