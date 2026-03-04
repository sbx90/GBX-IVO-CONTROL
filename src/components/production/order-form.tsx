"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useCreateOrder } from "@/hooks/use-production";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { cn } from "@/lib/utils";
import type { ProductionOrderItem } from "@/lib/types/database";

const schema = z.object({
  order_number: z.string().min(1, "Order number is required"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function OrderForm() {
  const [open, setOpen] = useState(false);
  const [targetDate, setTargetDate] = useState<Date | undefined>();
  const [mfgCode, setMfgCode] = useState("");

  const [showKit, setShowKit] = useState(false);
  const [showComp, setShowComp] = useState(false);

  const { data: kitDefinitions, isLoading: isLoadingDefs } = useKitDefinitions();
  const { data: catalog = [], isLoading: isLoadingCatalog } = useProductCatalog();

  // Kit variant quantities — keyed by definition ID
  const [kitQtys, setKitQtys] = useState<Record<string, number>>({});

  // Component quantities — keyed by part_number from product_catalog
  const [pnQtys, setPnQtys] = useState<Record<string, number>>({});

  const createOrder = useCreateOrder();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  function handleReset() {
    reset();
    setTargetDate(undefined);
    setMfgCode("");
    setShowKit(false);
    setShowComp(false);
    setKitQtys({});
    setPnQtys({});
  }

  async function onSubmit(data: FormData) {
    const items: ProductionOrderItem[] = [];

    if (showKit && kitDefinitions) {
      for (const def of kitDefinitions) {
        const qty = kitQtys[def.id] ?? 0;
        if (qty > 0) {
          items.push({ type: "KIT", reference: def.name, quantity: qty });
        }
      }
    }

    if (showComp) {
      for (const [pn, qty] of Object.entries(pnQtys)) {
        if (qty > 0) {
          items.push({ type: "COMPONENT", reference: pn, quantity: qty });
        }
      }
    }

    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

    await createOrder.mutateAsync({
      ...data,
      quantity: totalQty || 1,
      items,
      manufacture_code: mfgCode.trim() || undefined,
      target_date: targetDate ? format(targetDate, "yyyy-MM-dd") : undefined,
    });

    handleReset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Production Order</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
          {/* Order Number */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Order Number</Label>
            <Input
              placeholder="e.g. 9000970713"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              {...register("order_number")}
            />
            {errors.order_number && (
              <p className="text-red-400 text-xs">{errors.order_number.message}</p>
            )}
          </div>

          {/* What are you producing? */}
          <div className="space-y-3">
            <Label className="text-zinc-300">
              Producing{" "}
              <span className="text-zinc-500 font-normal">(select one or both)</span>
            </Label>

            {/* Toggle buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showComp && Object.values(pnQtys).some((q) => q > 0)) {
                    if (!confirm("Switching to Kit will clear your component quantities. Continue?")) return;
                  }
                  setShowKit((v) => !v); setShowComp(false); setPnQtys({}); setKitQtys({});
                }}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium border transition-colors",
                  showKit
                    ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                )}
              >
                Kit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showKit && Object.values(kitQtys).some((q) => q > 0)) {
                    if (!confirm("Switching to Components will clear your kit quantities. Continue?")) return;
                  }
                  setShowComp((v) => !v); setShowKit(false); setKitQtys({});
                }}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium border transition-colors",
                  showComp
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                )}
              >
                Components
              </button>
            </div>

            {/* Kit section */}
            {showKit && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                {isLoadingDefs ? (
                  <p className="text-xs text-zinc-500 text-center py-2">Loading kit types...</p>
                ) : !kitDefinitions || kitDefinitions.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-2">
                    No kit definitions found. Add them in Settings → Kit Defs.
                  </p>
                ) : (
                  kitDefinitions.map((def) => {
                    const qty = kitQtys[def.id] ?? 0;
                    return (
                      <div key={def.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <span className={cn("text-sm font-medium transition-colors", qty > 0 ? "text-blue-300" : "text-zinc-400")}>
                            {def.name}
                          </span>
                          {def.components.length > 0 && (
                            <p className="text-xs text-zinc-600">{def.components.length} components</p>
                          )}
                        </div>
                        <Input
                          type="number"
                          value={qty === 0 ? "" : qty}
                          placeholder="0"
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setKitQtys((prev) => ({ ...prev, [def.id]: isNaN(v) ? 0 : v }));
                          }}
                          className="w-24 bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Components section — driven by product_catalog */}
            {showComp && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">
                  Components — enter quantity for each item to include
                </p>
                {isLoadingCatalog ? (
                  <p className="text-xs text-zinc-500 text-center py-2">Loading products...</p>
                ) : catalog.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-2">
                    No products found. Add them in Settings → PDD.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {catalog.map(({ id, part_number }) => {
                      const qty = pnQtys[part_number] ?? 0;
                      return (
                        <div key={id} className="flex items-center gap-3">
                          <span className={cn(
                            "flex-1 text-sm font-mono truncate transition-colors",
                            qty > 0 ? "text-zinc-200" : "text-zinc-500"
                          )}>
                            {part_number}
                          </span>
                          <Input
                            type="number"
                            value={qty === 0 ? "" : qty}
                            placeholder="0"
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setPnQtys((prev) => ({ ...prev, [part_number]: isNaN(v) ? 0 : v }));
                            }}
                            className="w-20 h-8 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* S/N + Target Date + Notes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                S/N Code{" "}
                <span className="text-zinc-500 font-normal">(YYMM)</span>
              </Label>
              <Input
                type="text"
                maxLength={4}
                placeholder="e.g. 2509"
                value={mfgCode}
                onChange={(e) => setMfgCode(e.target.value.replace(/\D/g, ""))}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Target Date{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start bg-zinc-800 border-zinc-700 text-left font-normal h-9 text-sm",
                      !targetDate && "text-zinc-500"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-zinc-500" />
                    {targetDate ? format(targetDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-zinc-800 border-zinc-700">
                  <Calendar
                    mode="single"
                    selected={targetDate}
                    onSelect={setTargetDate}
                    initialFocus
                    className="bg-zinc-800 text-zinc-100"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Notes{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Textarea
                placeholder="Any notes about this order..."
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none h-9 min-h-0 py-2 text-sm"
                rows={1}
                {...register("notes")}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-white"
              disabled={createOrder.isPending}
            >
              {createOrder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Order"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
