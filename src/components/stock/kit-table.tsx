"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
import { KIT_STATUS_CONFIG, KIT_TYPE_CONFIG } from "@/lib/constants";
import { formatRelativeDate } from "@/lib/utils";
import type { Kit } from "@/lib/types/database";

interface KitTableProps {
  kits: Kit[];
  isLoading?: boolean;
}

function getTicketCount(kit: Kit): number {
  if (!kit.tickets) return 0;
  const first = kit.tickets[0];
  if (first && typeof first === "object" && "count" in first) {
    return (first as { count: number }).count;
  }
  return Array.isArray(kit.tickets) ? kit.tickets.length : 0;
}

export function KitTable({ kits, isLoading }: KitTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (kits.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">No kits found.</p>
        <p className="text-zinc-600 text-xs mt-1">
          Add your first kit to get started.
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
              Serial Number
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Type
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Tickets
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Created
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {kits.map((kit, index) => {
            const status = KIT_STATUS_CONFIG[kit.status];
            const type = KIT_TYPE_CONFIG[kit.type];
            const ticketCount = getTicketCount(kit);

            return (
              <TableRow
                key={kit.id}
                className="border-zinc-800 hover:bg-zinc-800/50"
              >
                <TableCell className="text-zinc-600 text-xs font-mono text-right w-12">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/stock/${kit.id}`}
                    className="font-mono text-sm text-zinc-200 hover:text-[#16a34a] transition-colors"
                  >
                    {kit.serial_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${type.bgColor} ${type.color} border-0`}
                  >
                    {type.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`}
                    />
                    <Badge
                      className={`text-xs ${status.bgColor} ${status.color} border-0`}
                    >
                      {status.label}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {ticketCount > 0 ? (
                    <span className="text-amber-400 text-sm font-medium">
                      {ticketCount}
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-sm">0</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 text-sm">
                  {formatRelativeDate(kit.created_at)}
                </TableCell>
                <TableCell>
                  <Link href={`/stock/${kit.id}`}>
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
