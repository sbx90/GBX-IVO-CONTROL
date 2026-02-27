"use client";

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCTION_STATUS_CONFIG, COMPONENT_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { ProductionOrder, ProductionStatus } from "@/lib/types/database";
import { isPast, parseISO } from "date-fns";

interface OrderKanbanProps {
  orders: ProductionOrder[];
}

const COLUMNS: { status: ProductionStatus; label: string }[] = [
  { status: "QUEUED", label: "Queued" },
  { status: "ACTIVE", label: "Active" },
  { status: "COMPLETE", label: "Complete" },
];

function getProgress(order: ProductionOrder) {
  const steps = order.production_steps ?? [];
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "DONE").length;
  return Math.round((done / steps.length) * 100);
}

export function OrderKanban({ orders }: OrderKanbanProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map(({ status, label }) => {
        const colOrders = orders.filter((o) => o.status === status);
        const cfg = PRODUCTION_STATUS_CONFIG[status];

        return (
          <div key={status} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
                {label}
              </span>
              <span className="text-xs text-zinc-600">
                {colOrders.length}
              </span>
            </div>

            <div className="space-y-2 min-h-20">
              {colOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-center">
                  <p className="text-xs text-zinc-600">No orders</p>
                </div>
              ) : (
                colOrders.map((order) => {
                  const pct = getProgress(order);
                  const isPastDue =
                    order.target_date &&
                    order.status !== "COMPLETE" &&
                    isPast(parseISO(order.target_date));

                  return (
                    <Link key={order.id} href={`/production/${order.id}`}>
                      <Card className="bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600 transition-all cursor-pointer">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-zinc-200">
                              {order.order_number}
                            </span>
                            <Badge
                              className={`text-xs px-1.5 py-0 h-4 ${cfg.bgColor} ${cfg.color} border-0`}
                            >
                              {order.quantity} units
                            </Badge>
                          </div>
                          {order.items && order.items.length > 0 && (
                            <div className="mb-1.5 space-y-0.5">
                              {order.items.slice(0, 2).map((item, i) => (
                                <p key={i} className={`text-xs truncate ${item.type === "KIT" ? "text-blue-400" : "text-amber-400"}`}>
                                  {item.type === "KIT"
                                    ? item.reference ?? "KIT"
                                    : item.reference
                                    ? item.reference
                                    : item.component_type
                                    ? (COMPONENT_CONFIG[item.component_type]?.partNumber ?? item.component_type)
                                    : "COMPONENT"} ×{item.quantity}
                                </p>
                              ))}
                              {order.items.length > 2 && (
                                <p className="text-xs text-zinc-500">+{order.items.length - 2} more</p>
                              )}
                            </div>
                          )}
                          <Progress
                            value={pct}
                            className="h-1 bg-zinc-700 mb-2"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">
                              {pct}% done
                            </span>
                            {order.target_date && (
                              <span
                                className={`text-xs ${
                                  isPastDue
                                    ? "text-red-400"
                                    : "text-zinc-600"
                                }`}
                              >
                                {formatDate(order.target_date)}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
