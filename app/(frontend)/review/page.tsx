"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Flag, Loader2, PencilLine } from "lucide-react";

import {
  Decision, DocMeta, Finding, getManifest, loadDocFindings, Manifest,
  pct, recordDecision,
} from "@/lib/demo";
import {
  ConfMeter, DecisionBadge, PageHeader, RoutingBadge, TintBadge,
} from "@/components/case-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface QueueItem { doc: DocMeta; f: Finding; key: string }
type Action = Exclude<Decision, null>;

const ACTIONS: { type: Action; label: string; icon: typeof CheckCircle }[] = [
  { type: "approved", label: "Approve", icon: CheckCircle },
  { type: "corrected", label: "Correct", icon: PencilLine },
  { type: "escalated", label: "Escalate", icon: Flag },
];

export default function ReviewQueue() {
  const [m, setM] = useState<Manifest | null>(null);
  const [all, setAll] = useState<QueueItem[]>([]);
  const [pending, setPending] = useState<{ key: string; type: Action } | null>(null);

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

  const act = async (item: QueueItem, decision: Action) => {
    setPending({ key: item.key, type: decision });
    await recordDecision(item.doc.id, item.f.idx, decision);
    setAll((prev) =>
      prev.map((x) => (x.key === item.key ? { ...x, f: { ...x.f, decision } } : x))
    );
    setPending(null);
  };

  if (!m) return <Skeleton className="mt-3 h-[80%] w-full" />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        overline={m.matter.litifyMatterNumber}
        title="Review queue"
        description="Findings below the auto-accept gate, lowest confidence first. Decisions persist and feed threshold tuning."
      >
        <TintBadge tone="amber">{remaining.length} awaiting</TintBadge>
        <TintBadge tone="emerald">{resolved.length} resolved</TintBadge>
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 px-4 font-medium">Finding</TableHead>
                <TableHead className="h-10 px-4 font-medium">Location</TableHead>
                <TableHead className="h-10 px-4 font-medium">Evidence</TableHead>
                <TableHead className="h-10 w-[140px] px-4 font-medium">Confidence</TableHead>
                <TableHead className="h-10 w-[130px] px-4 font-medium">Routing</TableHead>
                <TableHead className="h-10 w-[120px] px-4 font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((item) => {
                const { doc, f, key } = item;
                const busy = pending?.key === key;
                return (
                  <TableRow
                    key={key}
                    className={`hover:bg-muted/50 ${f.decision ? "opacity-55" : ""}`}
                  >
                    <TableCell className="max-w-[240px] px-4 py-2.5">
                      <div className="font-medium">{f.term_label}</div>
                      <div className="text-muted-foreground mt-0.5 truncate text-xs">
                        “{f.variant}” · {pct(f.match_quality)} match × {pct(f.ocr_conf)} OCR
                        {f.source === "ocr" ? " · scanned" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 whitespace-nowrap">
                      <Link href={`/workbench/${doc.id}`} className="font-medium hover:underline">
                        {doc.docType}
                      </Link>
                      <div className="text-muted-foreground text-xs">p.{f.page}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[280px] px-4 py-2.5 text-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block cursor-help truncate italic">
                            …{f.evidence}…
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{f.evidence}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 whitespace-nowrap">
                      <ConfMeter value={f.confidence} routing={f.routing} />
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <RoutingBadge routing={f.routing} />
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      {f.decision ? (
                        <DecisionBadge decision={f.decision} />
                      ) : (
                        <div className="flex items-center gap-1">
                          {ACTIONS.map(({ type, label, icon: Icon }) => (
                            <Tooltip key={type}>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => act(item, type)}
                                  disabled={busy}
                                  aria-label={label}
                                >
                                  {busy && pending?.type === type ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Icon className="size-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{label}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {all.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-28 px-4 text-center">
                    Queue is empty — every finding cleared the auto-accept threshold.
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
