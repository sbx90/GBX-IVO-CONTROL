"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StepPipeline } from "@/components/production/step-pipeline";
import { useProductionOrder, useDeleteOrder } from "@/hooks/use-production";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { PRODUCTION_STATUS_CONFIG, COMPONENT_CONFIG } from "@/lib/constants";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useProductionOrder(id);
  const { data: kitDefinitions } = useKitDefinitions();
  const deleteOrder = useDeleteOrder();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full bg-zinc-800" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 bg-zinc-800 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-48 bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500">Order not found.</p>
        <Link href="/production" className="text-[#16a34a] text-sm mt-2 block">
          Back to production
        </Link>
      </div>
    );
  }

  const steps = order.production_steps ?? [];
  const done = steps.filter((s) => s.status === "DONE").length;
  const total = steps.length || 10;
  const pct = Math.round((done / total) * 100);
  const status = PRODUCTION_STATUS_CONFIG[order.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/production">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-zinc-100 -ml-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Production
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-zinc-100">
                {order.order_number}
              </h1>
              <Badge
                className={`text-sm ${status.bgColor} ${status.color} border-0`}
              >
                {status.label}
              </Badge>
            </div>
            <p className="text-zinc-500 text-sm">
              {order.quantity} units
              {order.target_date && ` • Target: ${formatDate(order.target_date)}`}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <Progress value={pct} className="h-2 bg-zinc-700 w-48" />
              <span className="text-sm text-zinc-400">
                {done}/{total} steps • {pct}%
              </span>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
            disabled={deleteOrder.isPending}
            onClick={() => {
              if (confirm(`Delete order ${order.order_number}? This cannot be undone.`)) {
                deleteOrder.mutate(order.id, { onSuccess: () => router.push("/production") });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step pipeline */}
        <div className="lg:col-span-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Production Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {steps.length > 0 ? (
                <StepPipeline steps={steps} />
              ) : (
                <p className="text-zinc-500 text-sm py-8 text-center">
                  Steps loading...
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.items && order.items.length > 0 && (
                <>
                  <div>
                    <p className="text-zinc-500 text-xs mb-2 uppercase tracking-wider">Items</p>
                    <div className="space-y-2">
                      {order.items.map((item, i) => {
                        const label =
                          item.type === "KIT"
                            ? item.reference ?? "KIT"
                            : item.reference
                            ? item.reference
                            : item.component_type
                            ? (COMPONENT_CONFIG[item.component_type]?.partNumber ?? item.component_type)
                            : "COMPONENT";
                        const kitDef = item.type === "KIT"
                          ? kitDefinitions?.find((d) => d.name === item.reference)
                          : undefined;
                        return (
                          <div key={i}>
                            <div className="flex justify-between items-center">
                              <span className={item.type === "KIT" ? "text-blue-400" : "text-amber-400"}>
                                {label}
                              </span>
                              <span className="text-zinc-400 font-mono text-xs">×{item.quantity}</span>
                            </div>
                            {kitDef && kitDef.components.length > 0 && (
                              <div className="ml-3 mt-1 space-y-0.5 border-l border-zinc-700 pl-3">
                                {kitDef.components.map((comp, ci) => {
                                  const partNumber = comp.reference ?? COMPONENT_CONFIG[comp.component_type]?.partNumber ?? comp.component_type;
                                  const totalQty = comp.quantity * item.quantity;
                                  return (
                                    <div key={ci} className="flex justify-between items-center">
                                      <span className="text-zinc-400 text-xs">{partNumber}</span>
                                      <span className="text-zinc-500 font-mono text-xs">×{totalQty}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Separator className="bg-zinc-800" />
                </>
              )}
              {(() => {
                const kitQty = order.items?.filter((i) => i.type === "KIT").reduce((s, i) => s + i.quantity, 0) ?? 0;
                const itemQty = order.items?.reduce((s, item) => {
                  if (item.type === "KIT") {
                    const def = kitDefinitions?.find((d) => d.name === item.reference);
                    const compCount = def ? def.components.reduce((cs, c) => cs + c.quantity, 0) : 1;
                    return s + compCount * item.quantity;
                  }
                  return s + item.quantity;
                }, 0) ?? 0;
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">KIT Quantity</span>
                      <span className="text-zinc-200">{kitQty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Item Quantity</span>
                      <span className="text-zinc-200">{itemQty}</span>
                    </div>
                  </>
                );
              })()}
              <div className="flex justify-between">
                <span className="text-zinc-500">Progress</span>
                <span className="text-zinc-200">
                  {done} / {total} steps
                </span>
              </div>
              {order.target_date && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Target</span>
                  <span className="text-zinc-200">
                    {formatDate(order.target_date)}
                  </span>
                </div>
              )}
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-400 text-xs">
                  {formatDate(order.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Updated</span>
                <span className="text-zinc-400 text-xs">
                  {formatRelativeDate(order.updated_at)}
                </span>
              </div>
              {order.notes && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">Notes</p>
                    <p className="text-zinc-300 text-xs leading-relaxed">
                      {order.notes}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
