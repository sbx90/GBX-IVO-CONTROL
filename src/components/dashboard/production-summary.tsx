"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductionOrders } from "@/hooks/use-production";
import { PRODUCTION_STATUS_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export function ProductionSummary() {
  const { data: orders, isLoading } = useProductionOrders({
    status: "ACTIVE",
  });

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-100">
          Active Production
        </CardTitle>
        <Link
          href="/production"
          className="text-xs text-[#16a34a] hover:text-[#9d8fff] flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full bg-zinc-800" />
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">No active production orders.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Create an order to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const steps = order.production_steps ?? [];
              const done = steps.filter((s) => s.status === "DONE").length;
              const total = steps.length || 10;
              const pct = Math.round((done / total) * 100);
              const status = PRODUCTION_STATUS_CONFIG[order.status];

              return (
                <Link
                  key={order.id}
                  href={`/production/${order.id}`}
                  className="block p-3 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {order.order_number}
                      </span>
                      <Badge
                        className={`text-xs px-1.5 py-0 h-4 ${status.bgColor} ${status.color} border-0`}
                      >
                        {status.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {pct}% • {order.quantity} units
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 bg-zinc-800" />
                  {order.target_date && (
                    <p className="text-xs text-zinc-600 mt-1.5">
                      Target: {formatDate(order.target_date)}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
