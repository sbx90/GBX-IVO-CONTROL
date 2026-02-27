"use client";

import { useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
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
import { useCreateProductUnit } from "@/hooks/use-product-units";
import { COMPONENT_CONFIG, STOCK_COMPONENT_ORDER } from "@/lib/constants";
import type { ComponentType } from "@/lib/types/database";

// Extract LOT number embedded in serial string, e.g. "2505 LOT3" → { serial: "2505", lot: 3 }
export function parseLotFromSerial(value: string): {
  serial: string;
  lot: number | null;
} {
  const match = value.match(/\bLOT\s*(\d+)/i);
  if (!match) return { serial: value.trim(), lot: null };
  const lot = parseInt(match[1]);
  const serial = value.replace(match[0], "").replace(/\s+/g, " ").trim();
  return { serial, lot };
}

// Auto-detect component type from serial number prefix
export function detectComponentType(serial: string): ComponentType | null {
  const s = serial.toUpperCase();
  if (s.includes("_MB")) return "MAIN_BOARD";
  if (s.includes("_CAM-A") || s.includes("_CAMA")) return "CAMERA_A_140";
  if (s.includes("_CAM-B") || s.includes("_CAMB")) return "CAMERA_B_140";
  if (s.includes("_CAM-C") || s.includes("_CAMC")) return "CAMERA_C_70";
  if (s.includes("_CFR") || s.includes("_FRAME")) return "CAMERA_FRAME";
  if (s.includes("_CDL")) return "DOOR_LOCK_CABLE";
  if (s.includes("_ENC")) return "ENCLOSURE";
  if (s.includes("_PSU") || s.includes("_PWR")) return "POWER_SUPPLY";
  if (s.includes("_WIFI") || s.includes("_WIF")) return "WIFI_ANTENNA";
  // CELL_ANTENNA is auto-paired with WIFI_ANTENNA — not added manually
  return null;
}

interface AddUnitFormProps {
  defaultType?: ComponentType;
}

const LOT_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

export function AddUnitForm({ defaultType }: AddUnitFormProps) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [componentType, setComponentType] = useState<ComponentType | "">(
    defaultType ?? ""
  );
  const [lotNumber, setLotNumber] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const createUnit = useCreateProductUnit();

  function handleIdentifierChange(value: string) {
    // Auto-extract LOT from string (e.g. "2505 LOT3")
    const { serial: parsed, lot } = parseLotFromSerial(value);
    setIdentifier(parsed);
    if (lot !== null) setLotNumber(String(lot));

    // Always auto-detect component type from identifier
    const detected = detectComponentType(parsed);
    if (detected) setComponentType(detected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !componentType) return;

    try {
      await createUnit.mutateAsync({
        serial_number: identifier.trim(),
        component_type: componentType,
        lot_number: lotNumber && lotNumber !== "none" ? parseInt(lotNumber) : undefined,
        notes: notes.trim() || undefined,
      });

      setIdentifier("");
      setLotNumber("");
      setNotes("");
      if (!defaultType) setComponentType("");
      setOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Duplicate:")) {
        setDuplicateError(error.message);
      }
    }
  }

  return (
    <>
    {/* Duplicate alert — centered over everything */}
    <Dialog open={!!duplicateError} onOpenChange={() => setDuplicateError(null)}>
      <DialogContent className="bg-zinc-900 border-red-500/40 text-zinc-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            Duplicate Serial Number
          </DialogTitle>
        </DialogHeader>
        <p className="text-zinc-300 text-sm leading-relaxed">
          This serial number already exists in stock:
        </p>
        <p className="font-mono text-sm bg-zinc-800 rounded-lg px-3 py-2 text-red-300 break-all">
          {identifier.trim()}
        </p>
        <p className="text-zinc-500 text-xs">
          Please verify the serial number and try again.
        </p>
        <div className="flex justify-end pt-1">
          <Button
            onClick={() => setDuplicateError(null)}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
          >
            OK, go back
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white gap-2">
          <Plus className="h-4 w-4" />
          Add Unit
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Add Unit to Stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Part Number + Serial Number</Label>
            <Input
              value={identifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="e.g. GBXIVO-IMB_CAM-A1 or 2505 LOT3"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Component Type</Label>
              <Select
                value={componentType}
                onValueChange={(v) => setComponentType(v as ComponentType)}
                required
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
              <Label className="text-zinc-300 text-sm">
                LOT #{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select value={lotNumber} onValueChange={setLotNumber}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select LOT..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
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
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createUnit.isPending || !identifier.trim() || !componentType}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
            >
              {createUnit.isPending ? "Adding..." : "Add Unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
