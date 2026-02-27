"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddUnitForm } from "@/components/stock/add-unit-form";
import { ProductUnitTable } from "@/components/stock/product-unit-table";
import { useProductUnits } from "@/hooks/use-product-units";
import type { ComponentType, ProductUnitStatus } from "@/lib/types/database";
import { COMPONENT_CONFIG, STOCK_COMPONENT_ORDER, PRODUCT_UNIT_STATUS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

type TypeFilter = ComponentType | "ALL";
type StatusFilter = ProductUnitStatus | "ALL";

const STATUS_FILTERS: StatusFilter[] = ["ALL", "IN_STOCK", "IN_KIT", "FAULTY", "RETIRED"];

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const { data: rawUnits, isLoading } = useProductUnits({
    search: search || undefined,
    component_type: typeFilter,
    status: statusFilter,
  });

  // ENCLOSURE is auto-managed alongside MAIN_BOARD — hide it from the table
  const units = rawUnits?.filter((u) => u.component_type !== "ENCLOSURE");

  const totalInStock = units?.filter((u) => u.status === "IN_STOCK").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Stock Inventory</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {totalInStock} unit{totalInStock !== 1 ? "s" : ""} available
            {units && units.length !== totalInStock && (
              <span className="text-zinc-600"> · {units.length} total</span>
            )}
          </p>
        </div>

        {/* Search + Status filter + Add Unit — top right */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search serial numbers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  statusFilter === s
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {s === "ALL" ? "All" : PRODUCT_UNIT_STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          <AddUnitForm defaultType={typeFilter !== "ALL" ? typeFilter : undefined} />
        </div>
      </div>

      {/* Component type tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setTypeFilter("ALL")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            typeFilter === "ALL"
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          )}
        >
          All
        </button>
        {STOCK_COMPONENT_ORDER.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              typeFilter === type
                ? "bg-[#16a34a]/15 text-[#16a34a]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            )}
          >
            {type === "MAIN_BOARD"
              ? "Main Board (Enclosure)"
              : COMPONENT_CONFIG[type].label}
          </button>
        ))}
      </div>

      <ProductUnitTable units={units ?? []} isLoading={isLoading} />
    </div>
  );
}
