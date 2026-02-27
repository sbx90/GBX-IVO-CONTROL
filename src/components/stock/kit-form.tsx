"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";
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
import { useCreateKit } from "@/hooks/use-kits";

const schema = z.object({
  serial_number: z.string().min(1, "Serial number is required"),
  type: z.enum(["NEW", "RETURN"]),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function KitForm() {
  const [open, setOpen] = useState(false);
  const createKit = useCreateKit();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "NEW" },
  });

  const selectedType = watch("type");

  async function onSubmit(data: FormData) {
    await createKit.mutateAsync(data);
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Kit
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Add New Kit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Serial Number</Label>
            <Input
              placeholder="IVO-2024-0001"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              {...register("serial_number")}
            />
            {errors.serial_number && (
              <p className="text-red-400 text-xs">
                {errors.serial_number.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300">Type</Label>
            <div className="flex gap-3">
              {(["NEW", "RETURN"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue("type", t)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selectedType === t
                      ? t === "NEW"
                        ? "bg-blue-400/15 border-blue-400/40 text-blue-300"
                        : "bg-amber-400/15 border-amber-400/40 text-amber-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {t === "NEW" ? "New Kit" : "Return Kit"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              Notes{" "}
              <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Any notes about this kit..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
              rows={3}
              {...register("notes")}
            />
          </div>

          <div className="flex gap-3 pt-2">
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
              disabled={createKit.isPending}
            >
              {createKit.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Kit"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
