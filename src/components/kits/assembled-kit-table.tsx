"use client";

import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
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
import { ASSEMBLED_KIT_STATUS_CONFIG, STOCK_COMPONENT_ORDER } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useDeleteAssembledKit } from "@/hooks/use-assembled-kits";
import type { AssembledKit } from "@/lib/types/database";

interface AssembledKitTableProps {
  kits: AssembledKit[];
  isLoading?: boolean;
}

export function AssembledKitTable({ kits, isLoading }: AssembledKitTableProps) {
  const deleteKit = useDeleteAssembledKit();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (kits.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">No kits assembled yet.</p>
        <p className="text-zinc-600 text-xs mt-1">
          Use &quot;Assemble Kit&quot; to build a kit from stock.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider w-10 text-right">
              #
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Kit Number
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Client
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Components
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Created
            </TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {kits.map((kit, index) => {
            const statusCfg = ASSEMBLED_KIT_STATUS_CONFIG[kit.status];
            // ENCLOSURE is hidden — count only visible component types
            const componentCount =
              kit.product_units?.filter((u) => u.component_type !== "ENCLOSURE")
                .length ?? 0;
            const total = STOCK_COMPONENT_ORDER.length;

            return (
              <TableRow
                key={kit.id}
                className="border-zinc-800 hover:bg-zinc-800/50"
              >
                <TableCell className="text-zinc-600 text-xs font-mono text-right w-10">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/kits/${kit.id}`}
                    className="font-medium text-sm text-zinc-200 hover:text-[#16a34a] font-mono"
                  >
                    {kit.kit_number}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-zinc-400">
                  {kit.clients ? (
                    <span>{kit.clients.name}</span>
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
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: total }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-2 w-2 rounded-full ${
                            i < componentCount ? "bg-[#16a34a]" : "bg-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {componentCount}/{total}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {formatDate(kit.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Link href={`/kits/${kit.id}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteKit.mutate(kit.id)}
                      disabled={deleteKit.isPending}
                      className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                      title="Delete kit (returns components to stock)"
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
  );
}
