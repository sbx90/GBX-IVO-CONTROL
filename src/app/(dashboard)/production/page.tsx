"use client";

import { useState } from "react";
import { LayoutList, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderTable } from "@/components/production/order-table";
import { OrderKanban } from "@/components/production/order-kanban";
import { OrderForm } from "@/components/production/order-form";
import { useProductionOrders } from "@/hooks/use-production";
import { PRODUCTION_STATUS_CONFIG } from "@/lib/constants";
import type { ProductionStatus } from "@/lib/types/database";

export default function ProductionPage() {
  const [view, setView] = useState<"table" | "board">("table");
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | "ALL">("ALL");

  const { data: orders, isLoading } = useProductionOrders({
    status: statusFilter,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Production</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {orders?.length ?? 0} order{orders?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <OrderForm />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as ProductionStatus | "ALL")
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="ALL" className="text-zinc-300 focus:bg-zinc-700">
              All Status
            </SelectItem>
            {(["QUEUED", "ACTIVE", "COMPLETE", "CANCELLED"] as ProductionStatus[]).map(
              (s) => {
                const cfg = PRODUCTION_STATUS_CONFIG[s];
                return (
                  <SelectItem
                    key={s}
                    value={s}
                    className="text-zinc-200 focus:bg-zinc-700"
                  >
                    <span className={cfg.color}>{cfg.label}</span>
                  </SelectItem>
                );
              }
            )}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700 ml-auto">
          <button
            onClick={() => setView("table")}
            className={`p-1.5 rounded transition-colors ${
              view === "table"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("board")}
            className={`p-1.5 rounded transition-colors ${
              view === "board"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <OrderTable orders={orders ?? []} isLoading={isLoading} />
      ) : (
        <OrderKanban orders={orders ?? []} />
      )}
    </div>
  );
}
