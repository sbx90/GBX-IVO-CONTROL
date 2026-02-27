"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateAssembledKit } from "@/hooks/use-assembled-kits";
import { useProductUnits } from "@/hooks/use-product-units";
import { useClients } from "@/hooks/use-clients";
import {
  COMPONENT_CONFIG,
  STOCK_COMPONENT_ORDER,
  ENCLOSURE_SERIAL_SUFFIX,
} from "@/lib/constants";
import type { ComponentType } from "@/lib/types/database";

export function AssembleKitDialog() {
  const [open, setOpen] = useState(false);
  const [kitNumber, setKitNumber] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [notes, setNotes] = useState("");
  // component_type → selected product_unit id
  const [selectedUnits, setSelectedUnits] = useState<
    Partial<Record<ComponentType, string>>
  >({});

  const createKit = useCreateAssembledKit();
  const { data: clients } = useClients();
  const { data: allUnits } = useProductUnits({ status: "IN_STOCK" });

  function getAvailableUnits(type: ComponentType) {
    return allUnits?.filter((u) => u.component_type === type) ?? [];
  }

  const selectedCount = Object.values(selectedUnits).filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kitNumber.trim()) return;

    const unitIds = Object.values(selectedUnits).filter(Boolean) as string[];

    // Auto-include the paired ENCLOSURE unit when MAIN_BOARD is selected
    const mbId = selectedUnits["MAIN_BOARD"];
    if (mbId) {
      const mbUnit = allUnits?.find((u) => u.id === mbId);
      if (mbUnit) {
        const encUnit = allUnits?.find(
          (u) =>
            u.component_type === "ENCLOSURE" &&
            u.serial_number === mbUnit.serial_number + ENCLOSURE_SERIAL_SUFFIX
        );
        if (encUnit && !unitIds.includes(encUnit.id)) {
          unitIds.push(encUnit.id);
        }
      }
    }

    await createKit.mutateAsync({
      kit_number: kitNumber.trim(),
      client_id: clientId || undefined,
      notes: notes.trim() || undefined,
      unit_ids: unitIds,
    });

    // Reset
    setKitNumber("");
    setClientId("");
    setNotes("");
    setSelectedUnits({});
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white gap-2">
          <Plus className="h-4 w-4" />
          Assemble Kit
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Assemble New Kit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Kit info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Kit Number</Label>
              <Input
                value={kitNumber}
                onChange={(e) => setKitNumber(e.target.value)}
                placeholder="e.g. KIT-001"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">
                Client <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="No client" />
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

          {/* Component assignment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300 text-sm">Components</Label>
              <span className="text-xs text-zinc-500">
                {selectedCount}/{STOCK_COMPONENT_ORDER.length} assigned
              </span>
            </div>
            <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
              {STOCK_COMPONENT_ORDER.map((type) => {
                const available = getAvailableUnits(type);
                const selected = selectedUnits[type];

                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-44 flex-shrink-0">
                      {selected ? (
                        <Check className="h-3.5 w-3.5 text-[#16a34a] flex-shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 flex-shrink-0" />
                      )}
                      <span className="text-xs text-zinc-300 truncate">
                        {type === "MAIN_BOARD"
                          ? "Main Board (Enclosure)"
                          : COMPONENT_CONFIG[type].label}
                      </span>
                    </div>
                    <Select
                      value={selected ?? "none"}
                      onValueChange={(v) =>
                        setSelectedUnits((prev) => ({
                          ...prev,
                          [type]: v === "none" ? undefined : v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem
                          value="none"
                          className="text-zinc-500 focus:bg-zinc-700 text-xs"
                        >
                          Not assigned
                        </SelectItem>
                        {available.length === 0 ? (
                          <SelectItem
                            value="__empty__"
                            disabled
                            className="text-zinc-600 text-xs"
                          >
                            No units in stock
                          </SelectItem>
                        ) : (
                          available.map((unit) => (
                            <SelectItem
                              key={unit.id}
                              value={unit.id}
                              className="text-zinc-100 focus:bg-zinc-700 text-xs font-mono"
                            >
                              {unit.serial_number}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {available.length === 0 && (
                      <Badge className="text-[10px] bg-amber-400/10 text-amber-400 border-amber-400/20 flex-shrink-0">
                        0 in stock
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">
              Notes <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Assembly notes..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createKit.isPending || !kitNumber.trim()}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
            >
              {createKit.isPending ? "Creating..." : "Create Kit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
