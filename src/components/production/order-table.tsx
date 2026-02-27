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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCTION_STATUS_CONFIG, COMPONENT_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { ProductionOrder, ProductionOrderItem } from "@/lib/types/database";

interface OrderTableProps {
  orders: ProductionOrder[];
  isLoading?: boolean;
}

function getProgress(order: ProductionOrder) {
  const steps = order.production_steps ?? [];
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "DONE").length;
  return Math.round((done / steps.length) * 100);
}

function itemLabel(item: ProductionOrderItem): string {
  if (item.type === "KIT") return item.reference ?? "KIT";
  if (item.reference) return item.reference;
  if (!item.component_type) return "COMPONENT";
  return COMPONENT_CONFIG[item.component_type]?.partNumber ?? item.component_type;
}

function ItemsCell({ order }: { order: ProductionOrder }) {
  const items = order.items;
  if (!items || items.length === 0) return <span className="text-zinc-600">—</span>;

  const shown = items.slice(0, 2);
  const rest = items.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((item, i) => (
        <Badge
          key={i}
          className={`text-xs border-0 ${
            item.type === "KIT"
              ? "bg-blue-500/10 text-blue-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {itemLabel(item)} ×{item.quantity}
        </Badge>
      ))}
      {rest > 0 && (
        <span className="text-xs text-zinc-500">+{rest} more</span>
      )}
    </div>
  );
}

export function OrderTable({ orders, isLoading }: OrderTableProps) {
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
              Order #
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Items
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider min-w-32">
              Progress
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Target Date
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order, index) => {
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
                  <ItemsCell order={order} />
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${status.bgColor} ${status.color} border-0`}
                  >
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 bg-zinc-700 flex-1" />
                    <span className="text-xs text-zinc-500 w-8">{pct}%</span>
                  </div>
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
