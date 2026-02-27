"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useUpdateProductUnit } from "@/hooks/use-product-units";
import { parseLotFromSerial, detectComponentType } from "@/components/stock/add-unit-form";
import {
  COMPONENT_CONFIG,
  STOCK_COMPONENT_ORDER,
  PRODUCT_UNIT_STATUS_CONFIG,
} from "@/lib/constants";
import type { ComponentType, ProductUnit, ProductUnitStatus } from "@/lib/types/database";

const LOT_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

const EDITABLE_STATUSES: ProductUnitStatus[] = ["IN_STOCK", "FAULTY", "RETIRED"];

interface EditUnitDialogProps {
  unit: ProductUnit | null;
  onClose: () => void;
}

export function EditUnitDialog({ unit, onClose }: EditUnitDialogProps) {
  const [identifier, setIdentifier] = useState("");
  const [componentType, setComponentType] = useState<ComponentType | "">("");
  const [lotNumber, setLotNumber] = useState<string>("");
  const [status, setStatus] = useState<ProductUnitStatus>("IN_STOCK");
  const [notes, setNotes] = useState("");

  const updateUnit = useUpdateProductUnit();

  // Sync state whenever the unit changes
  useEffect(() => {
    if (unit) {
      setIdentifier(unit.serial_number);
      setComponentType(unit.component_type);
      setLotNumber(unit.lot_number != null ? String(unit.lot_number) : "none");
      setStatus(unit.status);
      setNotes(unit.notes ?? "");
    }
  }, [unit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unit || !identifier.trim() || !componentType) return;

    await updateUnit.mutateAsync({
      id: unit.id,
      updates: {
        serial_number: identifier.trim(),
        component_type: componentType,
        lot_number:
          lotNumber && lotNumber !== "none" ? parseInt(lotNumber) : null,
        status,
        notes: notes.trim() || null,
      },
    });

    onClose();
  }

  return (
    <Dialog open={!!unit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Edit Unit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Part Number + Serial Number — single field */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Part Number + Serial Number</Label>
            <Input
              value={identifier}
              onChange={(e) => {
                const { serial: parsed, lot } = parseLotFromSerial(e.target.value);
                setIdentifier(parsed);
                if (lot !== null) setLotNumber(String(lot));
                const detected = detectComponentType(parsed);
                if (detected) setComponentType(detected);
              }}
              placeholder="e.g. GBXIVO-IMB_CAM-A1"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>

          {/* Component Type + LOT # */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Component Type</Label>
              <Select
                value={componentType}
                onValueChange={(v) => setComponentType(v as ComponentType)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {STOCK_COMPONENT_ORDER.map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                      className="text-zinc-100 focus:bg-zinc-700"
                    >
                      {type === "MAIN_BOARD"
                        ? "Main Board (Enclosure)"
                        : COMPONENT_CONFIG[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">LOT #</Label>
              <Select value={lotNumber} onValueChange={setLotNumber}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select LOT..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem
                    value="none"
                    className="text-zinc-400 focus:bg-zinc-700"
                  >
                    No LOT
                  </SelectItem>
                  {LOT_OPTIONS.map((n) => (
                    <SelectItem
                      key={n}
                      value={String(n)}
                      className="text-zinc-100 focus:bg-zinc-700"
                    >
                      LOT {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProductUnitStatus)}
              disabled={unit?.status === "IN_KIT"}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {EDITABLE_STATUSES.map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    className="text-zinc-100 focus:bg-zinc-700"
                  >
                    {PRODUCT_UNIT_STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unit?.status === "IN_KIT" && (
              <p className="text-xs text-amber-400">
                Status cannot be changed while unit is assigned to a kit.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">
              Notes{" "}
              <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this unit..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateUnit.isPending || !identifier.trim() || !componentType}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
            >
              {updateUnit.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
