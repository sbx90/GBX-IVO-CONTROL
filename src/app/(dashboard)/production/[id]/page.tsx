"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, Trash2, Wand2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StepPipeline } from "@/components/production/step-pipeline";
import { useProductionOrder, useDeleteOrder, useUpdateOrder } from "@/hooks/use-production";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { useBulkCreateManufacturedItems, useLotImportsByOrder } from "@/hooks/use-manufactured";
import type { LotStatus } from "@/lib/types/database";
import { PRODUCTION_STATUS_CONFIG, COMPONENT_CONFIG } from "@/lib/constants";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useProductionOrder(id);
  const { data: kitDefinitions } = useKitDefinitions();
  const deleteOrder = useDeleteOrder();
  const updateOrder = useUpdateOrder();
  const bulkCreate = useBulkCreateManufacturedItems();
  const { data: orderLots = [] } = useLotImportsByOrder(id);
  const totalReceived = orderLots.reduce((s, l) => s + l.item_count, 0);
  const [mfgCode, setMfgCode] = useState("");

  useEffect(() => {
    setMfgCode(order?.manufacture_code ?? "");
  }, [order?.manufacture_code]);

  function saveMfgCode() {
    if (!order) return;
    const value = mfgCode.trim();
    if (value === (order.manufacture_code ?? "")) return;
    updateOrder.mutate({ id: order.id, updates: { manufacture_code: value || null } });
  }

  function handleGenerateItems() {
    if (!order?.manufacture_code || !order.items || !kitDefinitions) return;
    const items: { part_number: string; serial_number: string; lot_number: string; production_order_id: string }[] = [];
    for (const item of order.items) {
      if (item.type !== "KIT") continue;
      const kitDef = kitDefinitions.find((d) => d.name === item.reference);
      if (!kitDef) continue;
      for (const comp of kitDef.components) {
        const partNumber = comp.reference ?? COMPONENT_CONFIG[comp.component_type]?.partNumber ?? comp.component_type;
        const totalQty = comp.quantity * item.quantity;
        for (let i = 1; i <= totalQty; i++) {
          items.push({
            part_number: partNumber,
            serial_number: `${order.manufacture_code}${i.toString().padStart(4, "0")}`,
            lot_number: order.order_number,
            production_order_id: order.id,
          });
        }
      }
    }
    if (items.length === 0) return;
    bulkCreate.mutate(items);
  }

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
                                  const snStart = mfgCode ? `${mfgCode}0001` : null;
                                  const snEnd = mfgCode ? `${mfgCode}${totalQty.toString().padStart(4, "0")}` : null;
                                  return (
                                    <div key={ci} className="space-y-0.5">
                                      <div className="flex justify-between items-center">
                                        <span className="text-zinc-400 text-xs">{partNumber}</span>
                                        <span className="text-zinc-500 font-mono text-xs">×{totalQty}</span>
                                      </div>
                                      {snStart && (
                                        <p className="text-zinc-600 font-mono text-xs">
                                          S/N: {snStart} → {snEnd}
                                        </p>
                                      )}
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
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Manufacture Code</span>
                <input
                  type="text"
                  maxLength={4}
                  value={mfgCode}
                  placeholder="YYMM"
                  onChange={(e) => setMfgCode(e.target.value.replace(/\D/g, ""))}
                  onBlur={saveMfgCode}
                  onKeyDown={(e) => e.key === "Enter" && saveMfgCode()}
                  className="bg-transparent border-b border-zinc-700 text-zinc-200 text-xs font-mono w-16 text-right focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                />
              </div>
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
              {order.manufacture_code && order.items && order.items.length > 0 && (
                <>
                  <Separator className="bg-zinc-800" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 gap-2"
                    disabled={bulkCreate.isPending}
                    onClick={handleGenerateItems}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {bulkCreate.isPending ? "Generating..." : "Generate Items"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* LOT Inventory Card */}
          {(() => {
            const LOT_STATUS_CLASSES: Record<LotStatus, string> = {
              DELIVERED:    "bg-green-500/15 text-green-400 border-green-500/20",
              IN_TRANSIT:   "bg-blue-500/15 text-blue-400 border-blue-500/20",
              AT_WAREHOUSE: "bg-amber-400/15 text-amber-400 border-amber-400/20",
              AT_FACTORY:   "bg-zinc-700 text-zinc-300 border-zinc-600",
              DELAYED:      "bg-red-500/15 text-red-400 border-red-500/20",
            };
            return (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    LOT Inventory
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {orderLots.length === 0 ? (
                    <p className="text-zinc-600 text-xs text-center py-2">
                      No LOTs linked to this order yet.
                    </p>
                  ) : (
                    <>
                      {/* Progress */}
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-zinc-500">Items received</span>
                          <span className={`font-mono ${totalReceived >= order.quantity ? "text-green-400" : "text-amber-400"}`}>
                            {totalReceived} / {order.quantity}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${totalReceived >= order.quantity ? "bg-green-500" : "bg-amber-400"}`}
                            style={{ width: `${Math.min(100, (totalReceived / order.quantity) * 100)}%` }}
                          />
                        </div>
                        {totalReceived >= order.quantity && (
                          <p className="text-green-400 text-xs mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Fulfilled
                          </p>
                        )}
                      </div>
                      <Separator className="bg-zinc-800" />
                      {/* LOT list */}
                      <div className="space-y-2.5">
                        {orderLots.map((lot) => (
                          <div key={lot.id}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-mono text-zinc-200 text-xs">{lot.lot_number}</span>
                              <span className="text-zinc-400 text-xs">{lot.item_count} items</span>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${LOT_STATUS_CLASSES[lot.lot_status]}`}>
                                {lot.lot_status.replace(/_/g, " ")}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${lot.pl_approved ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-zinc-700 text-zinc-500 border-zinc-600"}`}>
                                PL {lot.pl_approved ? "✓" : "—"}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${lot.serial_approved ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-zinc-700 text-zinc-500 border-zinc-600"}`}>
                                S/N {lot.serial_approved ? "✓" : "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
