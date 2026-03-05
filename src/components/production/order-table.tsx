"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCTION_STATUS_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrderFulfillmentDetail, useOrderIssueCount, type LotRange } from "@/hooks/use-production";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import type { ProductionOrder, KitDefinition } from "@/lib/types/database";

interface OrderTableProps {
  orders: ProductionOrder[];
  isLoading?: boolean;
}

function getProgress(order: ProductionOrder) {
  const steps = order.production_steps ?? [];
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "DONE").length;
  return parseFloat(((done / steps.length) * 100).toFixed(2));
}


function calcTotalExpected(order: ProductionOrder, kitDefs: KitDefinition[]): number {
  if (!order.items || order.items.length === 0) return order.quantity;
  let total = 0;
  for (const item of order.items) {
    if (item.type === "KIT") {
      const def = kitDefs.find((d) => d.name === item.reference);
      if (def) {
        for (const comp of def.components) {
          if (!comp.reference || comp.reference === "undefined") continue;
          total += (comp.quantity ?? 1) * item.quantity;
        }
      } else {
        total += item.quantity;
      }
    } else {
      total += item.quantity;
    }
  }
  return total || order.quantity;
}

function ItemsCountCell({ order }: { order: ProductionOrder }) {
  const { data: snDetail, isLoading } = useOrderFulfillmentDetail(order.id, true);

  if (isLoading) return <span className="text-zinc-600 text-xs animate-pulse">…</span>;
  if (!snDetail || Object.keys(snDetail).length === 0) return <span className="text-zinc-600 text-xs">—</span>;

  const partCount = Object.keys(snDetail).length;
  const fulfilledCount = Object.values(snDetail).reduce((sum, d) => sum + d.count, 0);
  // Each part should reach order.quantity — consistent with the tooltip denominator
  const totalExpected = partCount * order.quantity;
  const complete = fulfilledCount >= totalExpected;

  return (
    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${complete ? "text-[#16a34a]" : "text-zinc-200"}`}>
      {fulfilledCount.toLocaleString()} / {totalExpected.toLocaleString()}
      {complete && <span className="text-[10px] font-medium uppercase tracking-wider ml-1.5">complete</span>}
    </span>
  );
}

function FulfilledCell({ order, onPctChange }: { order: ProductionOrder; onPctChange?: (id: string, pct: number) => void }) {
  const [open, setOpen] = useState(false);
  // Always load detail so the progress bar uses actual DB counts (not lot_imports.item_count
  // which double-counts when S/Ns overlap across LOTs)
  const { data: snDetail, isLoading: detailLoading } = useOrderFulfillmentDetail(order.id, true);
  const { data: kitDefs, isLoading: kitDefsLoading } = useKitDefinitions();

  const fulfilledCount = snDetail
    ? Object.values(snDetail).reduce((sum, d) => sum + d.count, 0)
    : (order.lot_imports ?? []).reduce((sum, l) => sum + (l.item_count ?? 0), 0);
  // Use snDetail-based expected (parts detected × order.quantity) — consistent with ItemsCountCell
  const totalExpected = snDetail && Object.keys(snDetail).length > 0
    ? Object.keys(snDetail).length * order.quantity
    : kitDefs ? calcTotalExpected(order, kitDefs) : null;
  const fulfillmentPct = totalExpected ? Math.min(100, parseFloat(((fulfilledCount / totalExpected) * 100).toFixed(2))) : 0;
  const isFull = fulfillmentPct >= 100;
  const isLoading = detailLoading;

  useEffect(() => {
    if (!isLoading && totalExpected) onPctChange?.(order.id, fulfillmentPct);
  }, [order.id, fulfillmentPct, isLoading, totalExpected, onPctChange]);

  if (!snDetail && (kitDefsLoading || totalExpected === null)) return <span className="text-zinc-600 text-xs animate-pulse">…</span>;
  if (totalExpected === 0) return <span className="text-zinc-600 text-xs">—</span>;

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="relative flex-1 h-6 rounded-full bg-zinc-700 overflow-hidden min-w-32">
              <div
                className={`h-full transition-all ${isFull ? "bg-[#16a34a]" : "bg-amber-400"}`}
                style={{ width: `${fulfillmentPct}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-black drop-shadow">
                {fulfillmentPct.toFixed(2)}%
              </span>
            </div>
            <span className={`text-xs tabular-nums w-20 shrink-0 ${isFull ? "text-[#16a34a] font-semibold" : "text-zinc-400"}`}>
              {isFull ? "fulfilled" : `${fulfilledCount.toLocaleString()} / ${totalExpected?.toLocaleString()}`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-900 border border-zinc-700 p-0 rounded-lg overflow-hidden w-[576px]">
          <div className="px-4 py-3 border-b border-zinc-700">
            <p className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Items</p>
          </div>
          {isLoading ? (
            <div className="px-4 py-5 text-zinc-500 text-sm">Loading…</div>
          ) : !snDetail || Object.keys(snDetail).length === 0 ? (
            <div className="px-4 py-5 text-zinc-600 text-sm">No LOTs imported yet.</div>
          ) : (
            <div className="px-4 py-4 space-y-5 max-h-[576px] overflow-y-auto">
              {Object.entries(snDetail).map(([pn, detail]) => {
                const pct = order.quantity > 0 ? Math.min(100, Math.round((detail.count / order.quantity) * 100)) : 0;
                const full = pct >= 100;
                return (
                  <div key={pn} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-zinc-100 font-mono text-sm font-medium">{pn}</span>
                      <span className={`text-sm tabular-nums shrink-0 ${full ? "text-[#16a34a] font-semibold" : "text-zinc-400"}`}>
                        {detail.count.toLocaleString()} / {order.quantity.toLocaleString()}
                      </span>
                    </div>
                    {/* Segmented bar — one slice per LOT */}
                    <div className="h-[42px] rounded bg-zinc-700 overflow-hidden flex">
                      {Object.entries(detail.lots ?? {}).map(([lot, range], i) => {
                        const segPct = order.quantity > 0 ? (range.count / order.quantity) * 100 : 0;
                        const colors = ["bg-amber-400","bg-blue-400","bg-violet-400","bg-cyan-400","bg-rose-400","bg-emerald-400"];
                        const bg = colors[i % colors.length];
                        return (
                          <div
                            key={lot}
                            className={`h-full flex items-center justify-center overflow-hidden ${bg}`}
                            style={{ width: `${segPct}%` }}
                          >
                            {segPct >= 10 && (
                              <span className="text-black text-[18px] font-black leading-none whitespace-nowrap px-1">
                                {lot} {Math.round(segPct)}% · {range.count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* S/N info per LOT */}
                    <div className="space-y-1">
                      {Object.entries(detail.lots ?? {}).map(([lot, range]) => {
                        const minN = parseInt(range.min, 10);
                        const maxN = parseInt(range.max, 10);
                        const isContiguous = !isNaN(minN) && !isNaN(maxN) && range.count === maxN - minN + 1;
                        return (
                          <p key={lot} className="text-xs flex items-center gap-2">
                            <span className="text-zinc-400 font-semibold w-12 shrink-0">{lot}</span>
                            <span className="text-zinc-600">{range.count} units</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function IssueCountCell({ orderId, onCountChange }: { orderId: string; onCountChange?: (id: string, n: number) => void }) {
  const { data: count, isLoading } = useOrderIssueCount(orderId);

  useEffect(() => {
    if (!isLoading && count !== undefined) onCountChange?.(orderId, count);
  }, [orderId, count, isLoading, onCountChange]);

  if (isLoading) return <span className="text-zinc-600 text-xs animate-pulse">…</span>;
  if (!count) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span className="flex items-center gap-1 text-sm font-semibold text-red-400">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      {count.toLocaleString()}
    </span>
  );
}

type SortKey = "order_number" | "status" | "progress" | "fulfillment" | "unresolved" | "target_date";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 text-zinc-600" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3 w-3 text-zinc-300" />
    : <ArrowDown className="h-3 w-3 text-zinc-300" />;
}

export function OrderTable({ orders, isLoading }: OrderTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("order_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [fulfillmentPcts, setFulfillmentPcts] = useState<Record<string, number>>({});
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});

  const handleFulfillmentPct = useCallback((id: string, pct: number) => {
    setFulfillmentPcts((prev) => (prev[id] === pct ? prev : { ...prev, [id]: pct }));
  }, []);

  const handleIssueCount = useCallback((id: string, n: number) => {
    setIssueCounts((prev) => (prev[id] === n ? prev : { ...prev, [id]: n }));
  }, []);

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const sorted = [...orders].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "order_number") {
      cmp = a.order_number.localeCompare(b.order_number);
    } else if (sortKey === "status") {
      cmp = a.status.localeCompare(b.status);
    } else if (sortKey === "progress") {
      cmp = getProgress(a) - getProgress(b);
    } else if (sortKey === "fulfillment") {
      cmp = (fulfillmentPcts[a.id] ?? -1) - (fulfillmentPcts[b.id] ?? -1);
    } else if (sortKey === "unresolved") {
      cmp = (issueCounts[a.id] ?? -1) - (issueCounts[b.id] ?? -1);
    } else if (sortKey === "target_date") {
      const da = a.target_date ? new Date(a.target_date).getTime() : Infinity;
      const db = b.target_date ? new Date(b.target_date).getTime() : Infinity;
      cmp = da - db;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">No production orders.</p>
        <p className="text-zinc-600 text-xs mt-1">
          Create your first order to start production.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider w-12 text-right">
              #
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              <button onClick={() => toggleSort("order_number")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Order # <SortIcon col="order_number" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Client
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider min-w-32">
              <button onClick={() => toggleSort("progress")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Progress <SortIcon col="progress" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider min-w-40">
              <button onClick={() => toggleSort("fulfillment")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Order Fulfilled <SortIcon col="fulfillment" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider min-w-32">
              Items Mfg
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Lots
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              <button onClick={() => toggleSort("unresolved")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Unresolved <SortIcon col="unresolved" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              <button onClick={() => toggleSort("target_date")} className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                Target Date <SortIcon col="target_date" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((order, index) => {
            const status = PRODUCTION_STATUS_CONFIG[order.status];
            const pct = getProgress(order);

            return (
              <TableRow
                key={order.id}
                className="border-zinc-800 hover:bg-zinc-800/50"
              >
                <TableCell className="text-zinc-600 text-xs font-mono text-right w-12">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/production/${order.id}`}
                    className="font-medium text-sm text-zinc-200 hover:text-[#16a34a]"
                  >
                    {order.order_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${status.bgColor} ${status.color} border-0`}
                  >
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const clients = [...new Set(
                      (order.lot_imports ?? [])
                        .map((l) => l.clients?.name)
                        .filter(Boolean) as string[]
                    )];
                    return clients.length > 0
                      ? <span className="text-sm text-zinc-300">{clients.join(", ")}</span>
                      : <span className="text-zinc-600 text-xs">—</span>;
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-3 bg-zinc-700 flex-1" />
                    <span className="text-xs text-zinc-500 w-14">{pct.toFixed(2)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <FulfilledCell order={order} onPctChange={handleFulfillmentPct} />
                </TableCell>
                <TableCell>
                  <ItemsCountCell order={order} />
                </TableCell>
                <TableCell>
                  {order.lot_imports && order.lot_imports.length > 0 ? (
                    <span className="text-xs text-zinc-300 font-mono">
                      {order.lot_imports
                        .map((l) => l.lot_number.replace(/^LOT/i, ""))
                        .sort((a, b) => Number(a) - Number(b))
                        .join(", ")}
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <IssueCountCell orderId={order.id} onCountChange={handleIssueCount} />
                </TableCell>
                <TableCell className="text-sm text-zinc-400">
                  {order.target_date ? formatDate(order.target_date) : "—"}
                </TableCell>
                <TableCell>
                  <Link href={`/production/${order.id}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
