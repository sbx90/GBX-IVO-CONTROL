"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, Trash2, Wand2, CheckCircle2, AlertTriangle, Pencil, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StepPipeline } from "@/components/production/step-pipeline";
import { useProductionOrder, useDeleteOrder, useUpdateOrder } from "@/hooks/use-production";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { useBulkCreateManufacturedItems, useLotImportsByOrder, useOrderPendingIssues, useResolveIssues } from "@/hooks/use-manufactured";
import type { LotStatus, ProductionStatus } from "@/lib/types/database";
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
  const { data: pendingIssues = [] } = useOrderPendingIssues(id);
  const resolveIssues = useResolveIssues();
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  function toggleExpandIssue(name: string) {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }
  const totalReceived = orderLots.reduce((s, l) => s + l.item_count, 0);

  // Expand kit → individual components to get real item target (null while loading)
  const totalExpected = (() => {
    if (!order?.items || !kitDefinitions) return null;
    let total = 0;
    for (const item of order.items) {
      if (item.type === "KIT") {
        const def = kitDefinitions.find((d) => d.name === item.reference);
        if (def) {
          for (const comp of def.components) {
            if (!comp.reference || comp.reference === "undefined") continue;
            total += (comp.quantity ?? 1) * item.quantity;
          }
        } else {
          total += item.quantity;
        }
      } else {
        total += item.quantity;
      }
    }
    return total || order?.quantity || 0;
  })();
  const [mfgCode, setMfgCode] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deletePwError, setDeletePwError] = useState(false);

  // Edit order dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [editPw, setEditPw] = useState("");
  const [editPwError, setEditPwError] = useState(false);
  const [editForm, setEditForm] = useState<{ status: string; target_date: string; notes: string; itemQtys: number[] }>({ status: "", target_date: "", notes: "", itemQtys: [] });

  useEffect(() => {
    setMfgCode(order?.manufacture_code ?? "");
  }, [order?.manufacture_code]);

  function openEditDialog() {
    if (!order) return;
    setEditForm({
      status: order.status,
      target_date: order.target_date ?? "",
      notes: order.notes ?? "",
      itemQtys: (order.items ?? []).map((i) => i.quantity),
    });
    setEditUnlocked(false);
    setEditPw("");
    setEditPwError(false);
    setEditOpen(true);
  }

  function handleEditSave() {
    if (!order) return;
    const updatedItems = (order.items ?? []).map((item, idx) => ({
      ...item,
      quantity: editForm.itemQtys[idx] ?? item.quantity,
    }));
    const newQuantity = updatedItems.reduce((s, i) => s + i.quantity, 0);
    updateOrder.mutate({
      id: order.id,
      updates: {
        status: editForm.status as ProductionStatus,
        target_date: editForm.target_date || null,
        notes: editForm.notes || null,
        items: updatedItems,
        quantity: newQuantity,
      },
    }, { onSuccess: () => setEditOpen(false) });
  }

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
        if (!comp.reference || comp.reference === "undefined") continue;
        const partNumber = comp.reference ?? (comp.component_type ? COMPONENT_CONFIG[comp.component_type]?.partNumber ?? comp.component_type : "UNKNOWN");
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

  // Pre-compute quantities for stat strip
  const kitQty = order.items?.filter((i) => i.type === "KIT").reduce((s, i) => s + i.quantity, 0) ?? 0;
  const itemQty = order.items?.reduce((s, item) => {
    if (item.type === "KIT") {
      const def = kitDefinitions?.find((d) => d.name === item.reference);
      const compCount = def ? def.components.filter(c => c.reference && c.reference !== "undefined").reduce((cs, c) => cs + c.quantity, 0) : 1;
      return s + compCount * item.quantity;
    }
    return s + item.quantity;
  }, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Compact header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/production">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 -ml-1">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Production
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">{order.order_number}</h1>
        <Badge className={`${status.bgColor} ${status.color} border-0`}>{status.label}</Badge>
        {pendingIssues.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            {pendingIssues.length} unresolved
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-300" onClick={openEditDialog}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
          disabled={deleteOrder.isPending}
          onClick={() => { setDeleteOpen(true); setDeletePw(""); setDeletePwError(false); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">KIT Qty</p>
          <p className="text-zinc-100 text-2xl font-bold mt-0.5">{kitQty}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Items</p>
          <p className="text-zinc-100 text-2xl font-bold mt-0.5">{itemQty}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Steps</p>
          <p className="text-zinc-100 text-2xl font-bold mt-0.5">{done}<span className="text-sm text-zinc-500">/{total}</span></p>
          <Progress value={pct} className="h-1 mt-1.5 bg-zinc-800" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Received</p>
          <p className={`text-2xl font-bold mt-0.5 ${totalExpected !== null && totalReceived >= totalExpected ? "text-[#16a34a]" : "text-amber-400"}`}>
            {totalReceived}<span className="text-sm text-zinc-500">/{totalExpected ?? "…"}</span>
          </p>
        </div>
      </div>

      {/* 3-column dashboard grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Col 1 — Order Details (scrollable) */}
        <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-base">
              {order.items && order.items.length > 0 && (
                <>
                  <div>
                    <p className="text-zinc-500 text-sm mb-2 uppercase tracking-wider">Items</p>
                    <div className="space-y-2">
                      {order.items.map((item, i) => {
                        const label =
                          item.type === "KIT"
                            ? item.reference ?? "KIT"
                            : item.reference ?? (item.component_type
                            ? (COMPONENT_CONFIG[item.component_type]?.partNumber ?? item.component_type)
                            : "COMPONENT");
                        const kitDef = item.type === "KIT"
                          ? kitDefinitions?.find((d) => d.name === item.reference)
                          : undefined;
                        return (
                          <div key={i}>
                            <div className="flex justify-between items-center">
                              <span className={item.type === "KIT" ? "text-blue-400 text-base" : "text-amber-400 text-base"}>{label}</span>
                              <span className="text-zinc-400 font-mono text-sm">×{item.quantity}</span>
                            </div>
                            {kitDef && kitDef.components.length > 0 && (
                              <div className="ml-3 mt-1 space-y-0.5 border-l border-zinc-700 pl-3">
                                {kitDef.components.filter(c => c.reference && c.reference !== "undefined").map((comp, ci) => {
                                  const partNumber = comp.reference ?? (comp.component_type ? COMPONENT_CONFIG[comp.component_type]?.partNumber ?? comp.component_type : "UNKNOWN");
                                  const totalQty = comp.quantity * item.quantity;
                                  const snStart = mfgCode ? `${mfgCode}0001` : null;
                                  const snEnd = mfgCode ? `${mfgCode}${totalQty.toString().padStart(4, "0")}` : null;
                                  return (
                                    <div key={ci} className="space-y-0.5">
                                      <div className="flex justify-between items-center">
                                        <span className="text-zinc-400 text-sm">{partNumber}</span>
                                        <span className="text-zinc-500 font-mono text-sm">×{totalQty}</span>
                                      </div>
                                      {snStart && <p className="text-zinc-600 font-mono text-sm">S/N: {snStart} → {snEnd}</p>}
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
                  className="bg-transparent border-b border-zinc-700 text-zinc-200 text-sm font-mono w-20 text-right focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                />
              </div>
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-zinc-500">Target</span>
                <span className="text-zinc-400 text-sm">{order.target_date ? formatDate(order.target_date) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-400 text-sm">{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Updated</span>
                <span className="text-zinc-400 text-sm">{formatRelativeDate(order.updated_at)}</span>
              </div>
              {order.notes && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div>
                    <p className="text-zinc-500 text-sm mb-1">Notes</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">{order.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Col 2 — Production Steps (scrollable) */}
        <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
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
                <p className="text-zinc-500 text-sm py-8 text-center">Steps loading...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Col 3 — Warnings + LOT Inventory (scrollable) */}
        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">

          {/* Warnings first */}
          {(() => {
            const lotsWithExtra = orderLots.filter(l => l.extra_units && Object.keys(l.extra_units).length > 0);
            const hasWarnings = pendingIssues.length > 0 || lotsWithExtra.length > 0;
            if (!hasWarnings) return null;
            const issueNames = Array.from(new Set(pendingIssues.map((i) => i.issue!))).sort();
            return (
              <Card className="bg-zinc-900 border-amber-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Warnings
                    </CardTitle>
                    <span className="text-xs text-amber-500 font-medium">
                      {[pendingIssues.length > 0 && `${pendingIssues.length} unresolved`, lotsWithExtra.length > 0 && `${lotsWithExtra.length} LOT extra`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {/* Extra units per LOT */}
                  {lotsWithExtra.map(lot => {
                    const total = Object.values(lot.extra_units!).reduce((s, n) => s + n, 0);
                    return (
                      <div key={lot.id} className="border border-amber-500/20 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5">
                          <span className="text-amber-400 font-semibold text-xs flex-1 uppercase">LOT {lot.lot_number} — +{total} extra units</span>
                        </div>
                        <div className="px-3 py-1.5 space-y-0.5">
                          {Object.entries(lot.extra_units!).map(([part, count]) => (
                            <div key={part} className="flex items-center gap-2 text-xs">
                              <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0" />
                              <span className="font-mono text-zinc-400 flex-1 truncate">{part}</span>
                              <span className="text-amber-400 font-semibold">+{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Pending item issues */}
                  {issueNames.map((issueName) => {
                    const groupItems = pendingIssues.filter((i) => i.issue === issueName);
                    const expanded = expandedIssues.has(issueName);
                    const byPart = groupItems.reduce((acc, item) => {
                      if (!acc[item.part_number]) acc[item.part_number] = [];
                      acc[item.part_number].push(item);
                      return acc;
                    }, {} as Record<string, typeof groupItems>);
                    return (
                      <div key={issueName} className="border border-zinc-700 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50">
                          <button type="button" onClick={() => toggleExpandIssue(issueName)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <span className="text-red-400 font-semibold text-xs flex-1 uppercase">{issueName}</span>
                          <span className="text-zinc-500 text-xs mr-2">({groupItems.length})</span>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                            disabled={resolveIssues.isPending} onClick={() => resolveIssues.mutate(groupItems.map((i) => i.id))}>
                            Resolve All
                          </Button>
                        </div>
                        {expanded && Object.entries(byPart).map(([part, items]) => (
                          <div key={part} className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-700/50 bg-zinc-800/20">
                            <ChevronRight className="h-3 w-3 text-zinc-600 ml-4 shrink-0" />
                            <span className="font-mono text-zinc-300 text-xs flex-1 truncate">{part}</span>
                            <span className="text-zinc-500 text-xs mr-2">({items.length})</span>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                              disabled={resolveIssues.isPending} onClick={() => resolveIssues.mutate(items.map((i) => i.id))}>
                              Resolve
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {pendingIssues.length > 0 && (
                    <p className="text-xs text-amber-500/70 pt-1 text-center">Resolve all issues before completing this order</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

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
                          <span className={`font-mono ${totalExpected !== null && totalReceived >= totalExpected ? "text-green-400" : "text-amber-400"}`}>
                            {totalReceived} / {totalExpected ?? "…"}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${totalExpected !== null && totalReceived >= totalExpected ? "bg-green-500" : "bg-amber-400"}`}
                            style={{ width: totalExpected ? `${Math.min(100, (totalReceived / totalExpected) * 100)}%` : "0%" }}
                          />
                        </div>
                        {totalExpected !== null && totalReceived >= totalExpected && (
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

      {/* Edit Order Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); setEditPw(""); setEditPwError(false); }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Edit Order Details</DialogTitle>
          </DialogHeader>

          {!editUnlocked ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Enter password to edit this order.</p>
              <Input
                type="password"
                placeholder="Password"
                value={editPw}
                onChange={(e) => { setEditPw(e.target.value); setEditPwError(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (editPw === "ivocontrol") { setEditUnlocked(true); }
                    else { setEditPwError(true); }
                  }
                }}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                autoFocus
              />
              {editPwError && <p className="text-xs text-red-400">Incorrect password</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)} className="text-zinc-400">Cancel</Button>
                <Button size="sm" className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                  onClick={() => {
                    if (editPw === "ivocontrol") { setEditUnlocked(true); }
                    else { setEditPwError(true); }
                  }}
                >
                  Unlock
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(order.items ?? []).length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 uppercase tracking-wider">Quantities</label>
                  <div className="space-y-2">
                    {(order.items ?? []).map((item, idx) => {
                      const label = item.type === "KIT"
                        ? (item.reference ?? "KIT")
                        : (item.reference ?? item.component_type ?? "COMPONENT");
                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 bg-zinc-800 rounded-md px-3 py-2">
                          <span className={`text-sm font-mono ${item.type === "KIT" ? "text-blue-400" : "text-amber-400"}`}>
                            {label}
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={editForm.itemQtys[idx] ?? item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setEditForm((f) => {
                                const qtys = [...f.itemQtys];
                                qtys[idx] = val;
                                return { ...f, itemQtys: qtys };
                              });
                            }}
                            className="bg-zinc-700 border border-zinc-600 text-zinc-100 text-right font-mono text-sm rounded px-2 py-1 w-24 focus:outline-none focus:border-zinc-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                  {editForm.itemQtys.length > 0 && (
                    <p className="text-xs text-zinc-500 text-right">
                      Total KITs: {editForm.itemQtys.reduce((s, q) => s + q, 0).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 uppercase tracking-wider">Status</label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="QUEUED">Queued</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="COMPLETE" disabled={pendingIssues.length > 0}>
                      Complete{pendingIssues.length > 0 ? " (resolve issues first)" : ""}
                    </SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 uppercase tracking-wider">Target Date</label>
                <Input
                  type="date"
                  value={editForm.target_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, target_date: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 uppercase tracking-wider">Notes</label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Order notes…"
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  size="sm"
                  disabled={updateOrder.isPending}
                  className="bg-[#16a34a] hover:bg-[#15803d] text-white"
                  onClick={handleEditSave}
                >
                  {updateOrder.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Order Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); setDeletePw(""); setDeletePwError(false); }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Delete Production Order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warning box */}
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-2">
              <p className="text-sm font-semibold text-red-300">This action cannot be undone.</p>
              <p className="text-xs text-red-400/80">Deleting order <span className="font-mono font-bold">{order?.order_number}</span> will permanently remove:</p>
              <ul className="text-xs text-red-400/70 space-y-1 ml-3 list-disc">
                <li>This production order and all its steps</li>
                <li>All <span className="font-semibold">{orderLots.length}</span> linked LOT{orderLots.length !== 1 ? "s" : ""} ({orderLots.map(l => l.lot_number).join(", ") || "none"})</li>
                <li>All <span className="font-semibold">{totalReceived.toLocaleString()}</span> manufactured items from those LOTs</li>
              </ul>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">Enter password to confirm deletion</p>
              <Input
                type="password"
                placeholder="Password"
                value={deletePw}
                onChange={(e) => { setDeletePw(e.target.value); setDeletePwError(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (deletePw === "ivocontrol") {
                      setDeleteOpen(false);
                      deleteOrder.mutate(order!.id, { onSuccess: () => router.push("/production") });
                    } else {
                      setDeletePwError(true);
                    }
                  }
                }}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                autoFocus
              />
              {deletePwError && <p className="text-xs text-red-400">Incorrect password</p>}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)} className="text-zinc-400">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={deleteOrder.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (deletePw === "ivocontrol") {
                    setDeleteOpen(false);
                    deleteOrder.mutate(order!.id, { onSuccess: () => router.push("/production") });
                  } else {
                    setDeletePwError(true);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Everything
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
