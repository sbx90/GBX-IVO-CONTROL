"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAssembledKit,
  useUpdateAssembledKit,
  useAssignUnitsToKit,
} from "@/hooks/use-assembled-kits";
import { useProductUnits } from "@/hooks/use-product-units";
import { useClients } from "@/hooks/use-clients";
import {
  COMPONENT_CONFIG,
  STOCK_COMPONENT_ORDER,
  ASSEMBLED_KIT_STATUS_CONFIG,
  PRODUCT_UNIT_STATUS_CONFIG,
  ENCLOSURE_SERIAL_SUFFIX,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { AssembledKitStatus, ComponentType, ProductUnit } from "@/lib/types/database";

export default function KitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: kit, isLoading } = useAssembledKit(id);
  const { data: clients } = useClients();
  const { data: stockUnits } = useProductUnits({ status: "IN_STOCK" });
  const updateKit = useUpdateAssembledKit();
  const assignUnits = useAssignUnitsToKit();

  const [editingClient, setEditingClient] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  // component_type → selected unit id (for editing components)
  const [editingComponents, setEditingComponents] = useState(false);
  const [componentSelections, setComponentSelections] = useState<
    Partial<Record<ComponentType, string>>
  >({});

  function startEditComponents() {
    if (!kit?.product_units) return;
    const current: Partial<Record<ComponentType, string>> = {};
    for (const unit of kit.product_units) {
      current[unit.component_type] = unit.id;
    }
    setComponentSelections(current);
    setEditingComponents(true);
  }

  // When MAIN_BOARD selection changes, auto-find and select the paired ENCLOSURE
  function handleComponentSelect(type: ComponentType, unitId: string | undefined) {
    setComponentSelections((prev) => {
      const next = { ...prev, [type]: unitId };

      if (type === "MAIN_BOARD") {
        const allAvailable = [
          ...(kit?.product_units ?? []),
          ...(stockUnits ?? []),
        ];
        if (unitId) {
          const mbUnit = allAvailable.find((u) => u.id === unitId);
          const encUnit = allAvailable.find(
            (u) =>
              u.component_type === "ENCLOSURE" &&
              u.serial_number === (mbUnit?.serial_number ?? "") + ENCLOSURE_SERIAL_SUFFIX
          );
          next["ENCLOSURE"] = encUnit?.id;
        } else {
          next["ENCLOSURE"] = undefined;
        }
      }

      return next;
    });
  }

  async function saveComponents() {
    if (!kit) return;
    const prevUnitIds = kit.product_units?.map((u) => u.id) ?? [];
    const newUnitIds = Object.values(componentSelections).filter(
      Boolean
    ) as string[];

    await assignUnits.mutateAsync({
      kitId: kit.id,
      unitIds: newUnitIds,
      prevUnitIds,
    });
    setEditingComponents(false);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <Skeleton className="h-64 w-full bg-zinc-800" />
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">Kit not found.</p>
        <Link href="/kits">
          <Button variant="ghost" className="mt-4 text-zinc-400">
            Back to Kits
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = ASSEMBLED_KIT_STATUS_CONFIG[kit.status];
  const componentMap: Partial<Record<ComponentType, ProductUnit>> = {};
  for (const unit of kit.product_units ?? []) {
    componentMap[unit.component_type] = unit;
  }

  function getAvailableUnitsForType(type: ComponentType) {
    const inStock = stockUnits?.filter((u) => u.component_type === type) ?? [];
    // Also include the currently assigned unit for this type
    const currentUnit = componentMap[type];
    if (currentUnit && !inStock.find((u) => u.id === currentUnit.id)) {
      return [currentUnit, ...inStock];
    }
    return inStock;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/kits">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Kits
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 font-mono">
            {kit.kit_number}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Created {formatDate(kit.created_at)}
          </p>
        </div>
        <Badge className={`text-sm ${statusCfg.bgColor} ${statusCfg.color} border-0`}>
          {statusCfg.label}
        </Badge>
      </div>

      {/* Meta card */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Status */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              Status
            </p>
            <Select
              value={kit.status}
              onValueChange={(v) =>
                updateKit.mutate({ id: kit.id, updates: { status: v as AssembledKitStatus } })
              }
            >
              <SelectTrigger className="h-8 w-40 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {(
                  [
                    "ASSEMBLING",
                    "READY",
                    "DEPLOYED",
                    "RETURNED",
                    "RETIRED",
                  ] as AssembledKitStatus[]
                ).map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    className="text-zinc-100 focus:bg-zinc-700"
                  >
                    {ASSEMBLED_KIT_STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Client */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              Client
            </p>
            <Select
              value={kit.client_id ?? "none"}
              onValueChange={(v) =>
                updateKit.mutate({
                  id: kit.id,
                  updates: { client_id: v === "none" ? null : v },
                })
              }
            >
              <SelectTrigger className="h-8 w-48 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
                  No client
                </SelectItem>
                {clients?.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    className="text-zinc-100 focus:bg-zinc-700"
                  >
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {kit.notes && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
              Notes
            </p>
            <p className="text-sm text-zinc-300">{kit.notes}</p>
          </div>
        )}
      </div>

      {/* Components */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Components (
            {kit.product_units?.filter((u) => u.component_type !== "ENCLOSURE").length ?? 0}
            /{STOCK_COMPONENT_ORDER.length})
          </h2>
          {editingComponents ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingComponents(false)}
                className="text-zinc-400 hover:text-zinc-100 h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveComponents}
                disabled={assignUnits.isPending}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white h-7 text-xs gap-1"
              >
                <Check className="h-3 w-3" />
                {assignUnits.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={startEditComponents}
              className="text-zinc-400 hover:text-zinc-100 h-7 text-xs gap-1.5"
            >
              <Pencil className="h-3 w-3" />
              Edit Components
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs text-zinc-500 uppercase tracking-wider px-4 py-2.5 font-normal">
                  Component
                </th>
                <th className="text-left text-xs text-zinc-500 uppercase tracking-wider px-4 py-2.5 font-normal">
                  Serial Number
                </th>
                <th className="text-left text-xs text-zinc-500 uppercase tracking-wider px-4 py-2.5 font-normal">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {STOCK_COMPONENT_ORDER.map((type, i) => {
                const unit = componentMap[type];
                const available = getAvailableUnitsForType(type);

                return (
                  <tr
                    key={type}
                    className={`${
                      i !== STOCK_COMPONENT_ORDER.length - 1
                        ? "border-b border-zinc-800"
                        : ""
                    } hover:bg-zinc-800/30`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {unit ? (
                          <Check className="h-3.5 w-3.5 text-[#16a34a] flex-shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 flex-shrink-0" />
                        )}
                        <span className="text-sm text-zinc-300">
                          {type === "MAIN_BOARD"
                            ? "Main Board (Enclosure)"
                            : COMPONENT_CONFIG[type].label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {editingComponents ? (
                        <Select
                          value={componentSelections[type] ?? "none"}
                          onValueChange={(v) =>
                            handleComponentSelect(type, v === "none" ? undefined : v)
                          }
                        >
                          <SelectTrigger className="h-7 w-56 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700">
                            <SelectItem
                              value="none"
                              className="text-zinc-500 focus:bg-zinc-700 text-xs"
                            >
                              Not assigned
                            </SelectItem>
                            {available.map((u) => (
                              <SelectItem
                                key={u.id}
                                value={u.id}
                                className="text-zinc-100 focus:bg-zinc-700 text-xs font-mono"
                              >
                                {u.serial_number}
                              </SelectItem>
                            ))}
                            {available.length === 0 && (
                              <SelectItem
                                value="__empty__"
                                disabled
                                className="text-zinc-600 text-xs"
                              >
                                No units in stock
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span
                          className={`text-sm font-mono ${
                            unit ? "text-zinc-200" : "text-zinc-600"
                          }`}
                        >
                          {unit?.serial_number ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {unit && (
                        <Badge
                          className={`text-xs ${
                            PRODUCT_UNIT_STATUS_CONFIG[unit.status].bgColor
                          } ${PRODUCT_UNIT_STATUS_CONFIG[unit.status].color} border-0`}
                        >
                          {PRODUCT_UNIT_STATUS_CONFIG[unit.status].label}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
