"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, AlertTriangle, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKits } from "@/hooks/use-kits";
import { useCreateTicket } from "@/hooks/use-tickets";
import { useClients } from "@/hooks/use-clients";
import {
  ISSUE_CATEGORY_CONFIG,
  PRIORITY_CONFIG,
  COMPONENT_CONFIG,
  MAINBOARD_SECTION_CONFIG,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  IssueCategory,
  TicketPriority,
  KitComponent,
  MainboardSectionRecord,
} from "@/lib/types/database";

const schema = z.object({
  kit_id: z.string().min(1, "Select a kit"),
  client_id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  issue_category: z.enum([
    "USB",
    "POWER",
    "CAMERA",
    "WIFI",
    "CELLULAR",
    "DOOR_LOCK",
    "CM4_PROCESSOR",
    "ENCLOSURE",
    "FIRMWARE",
    "WRONG_CONNECTOR",
    "OTHER",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  component_id: z.string().optional(),
  mainboard_section_id: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface TicketFormProps {
  defaultKitId?: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function TicketForm({ defaultKitId, trigger, onSuccess }: TicketFormProps) {
  const [open, setOpen] = useState(false);
  const [kitComboOpen, setKitComboOpen] = useState(false);
  const { data: kits } = useKits();
  const { data: clients } = useClients();
  const createTicket = useCreateTicket();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      kit_id: defaultKitId ?? "",
      priority: "MEDIUM",
    },
  });

  const kitId = watch("kit_id");
  const issueCategory = watch("issue_category");
  const componentId = watch("component_id");

  const selectedKit = kits?.find((k) => k.id === kitId);
  const components = (selectedKit?.kit_components ?? []) as KitComponent[];
  const selectedComponent = components.find((c) => c.id === componentId);
  const sections = (selectedComponent?.mainboard_sections ?? []) as MainboardSectionRecord[];
  const isMainBoard = selectedComponent?.component_type === "MAIN_BOARD";

  const showPowerWarning =
    issueCategory === "POWER" || issueCategory === "WRONG_CONNECTOR";

  async function onSubmit(data: FormData) {
    await createTicket.mutateAsync({
      kit_id: data.kit_id,
      client_id: data.client_id || undefined,
      title: data.title,
      description: data.description,
      issue_category: data.issue_category,
      priority: data.priority,
      component_id: data.component_id || undefined,
      mainboard_section_id: data.mainboard_section_id || undefined,
    });
    reset();
    setOpen(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Kit selector */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Kit</Label>
            <Popover open={kitComboOpen} onOpenChange={setKitComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 font-normal"
                >
                  {selectedKit?.serial_number ?? "Select kit..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 text-zinc-500" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-zinc-800 border-zinc-700">
                <Command className="bg-transparent">
                  <CommandInput
                    placeholder="Search serial number..."
                    className="text-zinc-200 placeholder:text-zinc-500"
                  />
                  <CommandList>
                    <CommandEmpty className="text-zinc-500 text-sm py-3 text-center">
                      No kits found.
                    </CommandEmpty>
                    <CommandGroup>
                      {kits?.map((kit) => (
                        <CommandItem
                          key={kit.id}
                          value={kit.serial_number}
                          onSelect={() => {
                            setValue("kit_id", kit.id);
                            setValue("component_id", "");
                            setValue("mainboard_section_id", "");
                            setKitComboOpen(false);
                          }}
                          className="text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              kitId === kit.id ? "opacity-100 text-[#16a34a]" : "opacity-0"
                            )}
                          />
                          <span className="font-mono">{kit.serial_number}</span>
                          <span className="ml-2 text-xs text-zinc-500">
                            {kit.type}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.kit_id && (
              <p className="text-red-400 text-xs">{errors.kit_id.message}</p>
            )}
          </div>

          {/* Client selector */}
          {clients && clients.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Client{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select
                value={watch("client_id") || "none"}
                onValueChange={(v) => setValue("client_id", v === "none" ? "" : v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
                    No client
                  </SelectItem>
                  {clients.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      className="text-zinc-200 focus:bg-zinc-700"
                    >
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Title</Label>
            <Input
              placeholder="Brief description of the issue"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-red-400 text-xs">{errors.title.message}</p>
            )}
          </div>

          {/* Issue Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Category</Label>
              <Select
                value={issueCategory}
                onValueChange={(v) => setValue("issue_category", v as IssueCategory)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {Object.entries(ISSUE_CATEGORY_CONFIG).map(([key, val]) => (
                    <SelectItem
                      key={key}
                      value={key}
                      className="text-zinc-200 focus:bg-zinc-700"
                    >
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Priority</Label>
              <Select
                value={watch("priority")}
                onValueChange={(v) => setValue("priority", v as TicketPriority)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as TicketPriority[]).map(
                    (p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      return (
                        <SelectItem
                          key={p}
                          value={p}
                          className="text-zinc-200 focus:bg-zinc-700"
                        >
                          <span className={cfg.color}>{cfg.label}</span>
                        </SelectItem>
                      );
                    }
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Power warning */}
          {showPowerWarning && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-400/10 border border-amber-400/30">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  ⚠ Verify Power Connector
                </p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  Before continuing — has the power cable been verified to be in
                  the LEFT connector (POWER_MAIN)? The #1 installation error is
                  plugging into the RIGHT connector (POWER_2).
                </p>
              </div>
            </div>
          )}

          {/* Component (optional) */}
          {kitId && components.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Component{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select
                value={watch("component_id") || "none"}
                onValueChange={(v) => {
                  setValue("component_id", v === "none" ? "" : v);
                  setValue("mainboard_section_id", "");
                }}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select component..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
                    No specific component
                  </SelectItem>
                  {components.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      className="text-zinc-200 focus:bg-zinc-700"
                    >
                      {COMPONENT_CONFIG[c.component_type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Board section (only for MAIN_BOARD) */}
          {isMainBoard && sections.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Board Section{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select
                value={watch("mainboard_section_id") || "none"}
                onValueChange={(v) => setValue("mainboard_section_id", v === "none" ? "" : v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select section..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
                    No specific section
                  </SelectItem>
                  {sections.map((s) => {
                    const cfg = MAINBOARD_SECTION_CONFIG[s.section_name];
                    return (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-zinc-200 focus:bg-zinc-700"
                      >
                        <span className={cfg.isDanger ? "text-red-300" : ""}>
                          {cfg.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              Description{" "}
              <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Detailed description of the issue..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
              rows={3}
              {...register("description")}
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
              disabled={createTicket.isPending}
            >
              {createTicket.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Ticket"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
