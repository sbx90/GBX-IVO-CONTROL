"use client";

import { CheckCircle2, AlertTriangle, Plus, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InventoryCheckResult } from "@/hooks/use-production";

interface InventoryCheckCardProps {
  results: InventoryCheckResult[] | undefined;
  isLoading: boolean;
}

export function InventoryCheckCard({ results, isLoading }: InventoryCheckCardProps) {
  if (isLoading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-48 bg-zinc-800" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-1.5 w-full bg-zinc-800 rounded-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-zinc-800 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!results || results.length === 0) return null;

  const totalExpected = results.reduce((s, r) => s + r.expectedQty, 0);
  const totalFound = results.reduce((s, r) => s + r.foundCount, 0);
  const totalMissing = results.reduce((s, r) => s + r.missing, 0);
  const totalExtra = results.reduce((s, r) => s + r.extra, 0);
  const allMatch = totalMissing === 0 && totalExtra === 0;
  const pct = totalExpected > 0 ? Math.min(100, (Math.min(totalFound, totalExpected) / totalExpected) * 100) : 0;

  return (
    <Card className={cn("bg-zinc-900", allMatch ? "border-green-500/30" : "border-amber-500/30")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            {allMatch ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            )}
            Inventory Verification
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium tabular-nums", allMatch ? "text-green-400" : "text-amber-400")}>
              {totalFound.toLocaleString()} / {totalExpected.toLocaleString()}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {/* Overall progress */}
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", allMatch ? "bg-green-500" : "bg-amber-400")}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Summary line */}
        {!allMatch && (
          <div className="flex items-center gap-3 text-xs pb-1">
            {totalMissing > 0 && (
              <span className="text-amber-400 flex items-center gap-1">
                <Minus className="h-3 w-3" />
                {totalMissing.toLocaleString()} missing
              </span>
            )}
            {totalExtra > 0 && (
              <span className="text-blue-400 flex items-center gap-1">
                <Plus className="h-3 w-3" />
                {totalExtra.toLocaleString()} extra
              </span>
            )}
          </div>
        )}

        {/* Per-part rows */}
        {results.map(part => {
          const isExact = part.missing === 0 && part.extra === 0;
          const isUnexpected = part.expectedQty === 0;

          return (
            <div
              key={part.partNumber}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs",
                isExact
                  ? "border-green-500/20 bg-green-500/5"
                  : isUnexpected
                  ? "border-blue-500/20 bg-blue-500/5"
                  : part.missing > 0
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-blue-500/20 bg-blue-500/5"
              )}
            >
              <span className="font-mono text-zinc-300 truncate flex-1">{part.partNumber}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("font-mono tabular-nums font-semibold",
                  isExact ? "text-green-400" : isUnexpected ? "text-blue-400" : part.missing > 0 ? "text-amber-400" : "text-blue-400"
                )}>
                  {part.foundCount.toLocaleString()}
                  {!isUnexpected && <span className="text-zinc-600">/{part.expectedQty.toLocaleString()}</span>}
                </span>
                {part.missing > 0 && (
                  <span className="text-amber-400 flex items-center gap-0.5">
                    <Minus className="h-3 w-3" />{part.missing}
                  </span>
                )}
                {part.extra > 0 && (
                  <span className="text-blue-400 flex items-center gap-0.5">
                    <Plus className="h-3 w-3" />{part.extra}
                    {isUnexpected && <span className="text-blue-500 ml-1">(unexpected)</span>}
                  </span>
                )}
                {isExact && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
