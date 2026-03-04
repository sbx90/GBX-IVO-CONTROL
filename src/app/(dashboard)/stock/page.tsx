"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddUnitForm } from "@/components/stock/add-unit-form";
import { ProductUnitTable } from "@/components/stock/product-unit-table";
import { useProductUnits } from "@/hooks/use-product-units";
import { useManufacturedItemsAtLocation } from "@/hooks/use-manufactured";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ComponentType, ProductUnitStatus, ManufacturedItemStatus } from "@/lib/types/database";
import { COMPONENT_CONFIG, STOCK_COMPONENT_ORDER, PRODUCT_UNIT_STATUS_CONFIG } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

type TypeFilter = ComponentType | "ALL";
type StatusFilter = ProductUnitStatus | "ALL";

const STATUS_FILTERS: StatusFilter[] = ["ALL", "IN_STOCK", "IN_KIT", "FAULTY", "RETIRED"];

const MFG_STATUS_CONFIG: Record<ManufacturedItemStatus, { label: string; className: string }> = {
  OK:         { label: "OK",         className: "bg-teal-500/15 text-teal-400 border-0" },
  IN_PROCESS: { label: "In Process", className: "bg-yellow-500/15 text-yellow-400 border-0" },
  IN_TRANSIT: { label: "In Transit", className: "bg-sky-500/15 text-sky-400 border-0" },
  AT_CLIENT:  { label: "@Client",    className: "bg-green-500/15 text-green-400 border-0" },
  RETURNED:   { label: "Returned",   className: "bg-amber-400/15 text-amber-400 border-0" },
  BAD:        { label: "Bad",        className: "bg-red-500/15 text-red-400 border-0" },
  MANUAL:     { label: "Manual",     className: "bg-purple-500/15 text-purple-400 border-0" },
  EXTRA:      { label: "Extra Unit", className: "bg-orange-500/15 text-orange-400 border-0" },
};

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const { data: mfgAtGBX = [] } = useManufacturedItemsAtLocation("GBX");

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

      {/* Manufactured Items at GBX */}
      {mfgAtGBX.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Manufactured at GBX</h2>
            <span className="text-xs text-zinc-600">{mfgAtGBX.length.toLocaleString()} items</span>
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-500 w-12">#</TableHead>
                  <TableHead className="text-zinc-500">Part Number</TableHead>
                  <TableHead className="text-zinc-500">Serial Number</TableHead>
                  <TableHead className="text-zinc-500">LOT #</TableHead>
                  <TableHead className="text-zinc-500">Client</TableHead>
                  <TableHead className="text-zinc-500">Status</TableHead>
                  <TableHead className="text-zinc-500">Date Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mfgAtGBX.map((item, i) => (
                  <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="text-zinc-500 text-sm">{i + 1}</TableCell>
                    <TableCell className="text-zinc-100 text-sm font-medium">{item.part_number}</TableCell>
                    <TableCell className="text-zinc-400 text-sm font-mono">{item.serial_number}</TableCell>
                    <TableCell className="text-zinc-400 text-sm font-mono">{item.lot_number ?? <span className="text-zinc-600">—</span>}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{item.clients?.name ?? <span className="text-zinc-600">—</span>}</TableCell>
                    <TableCell>{(() => { const s = MFG_STATUS_CONFIG[item.status] ?? { label: item.status, className: "bg-zinc-700 text-zinc-400 border-0" }; return <Badge className={s.className}>{s.label}</Badge>; })()}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{formatDate(item.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
