"use client";

import { useState } from "react";
import { Trash2, Pencil, ExternalLink } from "lucide-react";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_UNIT_STATUS_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useDeleteProductUnit } from "@/hooks/use-product-units";
import { EditUnitDialog } from "@/components/stock/edit-unit-dialog";
import type { ProductUnit } from "@/lib/types/database";

interface ProductUnitTableProps {
  units: ProductUnit[];
  isLoading?: boolean;
}

export function ProductUnitTable({ units, isLoading }: ProductUnitTableProps) {
  const deleteUnit = useDeleteProductUnit();
  const [editingUnit, setEditingUnit] = useState<ProductUnit | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">No units in stock.</p>
        <p className="text-zinc-600 text-xs mt-1">
          Add your first unit using the button above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider w-10 text-right">
                #
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                Part Number + Serial Number
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider w-20">
                LOT #
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                Kit
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                Notes
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                Added
              </TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit, index) => {
              const statusCfg = PRODUCT_UNIT_STATUS_CONFIG[unit.status];

              return (
                <TableRow
                  key={unit.id}
                  className="border-zinc-800 hover:bg-zinc-800/50"
                >
                  <TableCell className="text-zinc-600 text-xs font-mono text-right w-10">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-200">
                    {unit.serial_number}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400">
                    {unit.lot_number != null ? (
                      <span className="font-mono">LOT {unit.lot_number}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-xs ${statusCfg.bgColor} ${statusCfg.color} border-0`}
                    >
                      {statusCfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400">
                    {unit.assembled_kits ? (
                      <Link
                        href={`/kits/${unit.kit_id}`}
                        className="flex items-center gap-1 text-[#16a34a] hover:text-[#15803d] text-xs font-mono"
                      >
                        {unit.assembled_kits.kit_number}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400 max-w-40">
                    <span className="truncate block" title={unit.notes ?? undefined}>
                      {unit.notes ?? (
                        <span className="text-zinc-600 text-xs italic">—</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {formatDate(unit.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingUnit(unit)}
                        className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-100"
                        title="Edit unit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteUnit.mutate(unit.id)}
                        disabled={unit.status === "IN_KIT"}
                        className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 disabled:opacity-30"
                        title={
                          unit.status === "IN_KIT"
                            ? "Cannot delete — unit is in a kit"
                            : "Delete unit"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EditUnitDialog
        unit={editingUnit}
        onClose={() => setEditingUnit(null)}
      />
    </>
  );
}
