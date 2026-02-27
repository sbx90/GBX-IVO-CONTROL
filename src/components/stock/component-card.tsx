"use client";

import { useState } from "react";
import {
  Box,
  CircuitBoard,
  Camera,
  Zap,
  Wifi,
  Signal,
  Lock,
  Loader2,
  Map,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPONENT_CONFIG, COMPONENT_STATUS_CONFIG } from "@/lib/constants";
import type { KitComponent, ComponentStatus } from "@/lib/types/database";
import { useUpdateKitComponent } from "@/hooks/use-kits";

const iconMap: Record<string, React.ElementType> = {
  Box,
  Circuit: CircuitBoard,
  Camera,
  Zap,
  Wifi,
  Signal,
  Lock,
};

interface ComponentCardProps {
  component: KitComponent;
  kitId: string;
  onViewBoard?: () => void;
}

export function ComponentCard({ component, kitId, onViewBoard }: ComponentCardProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ComponentStatus>(component.status);
  const [notes, setNotes] = useState(component.notes ?? "");
  const updateComponent = useUpdateKitComponent();

  const config = COMPONENT_CONFIG[component.component_type];
  const statusConfig = COMPONENT_STATUS_CONFIG[component.status];
  const Icon = iconMap[config.icon] ?? Box;
  const isMainBoard = component.component_type === "MAIN_BOARD";

  async function handleSave() {
    await updateComponent.mutateAsync({
      id: component.id,
      kitId,
      updates: { status, notes: notes || undefined },
    });
    setOpen(false);
  }

  return (
    <>
      <Card
        className="bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600 transition-all cursor-pointer group"
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-zinc-700/50">
              <Icon className="h-4 w-4 text-zinc-300" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${statusConfig.dotColor}`} />
              <Badge
                className={`text-xs ${statusConfig.bgColor} ${statusConfig.color} border-0`}
              >
                {statusConfig.label}
              </Badge>
            </div>
          </div>
          <p className="text-sm font-medium text-zinc-200 group-hover:text-white">
            {config.label}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            {config.description}
          </p>
          {isMainBoard && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-6 text-xs text-[#16a34a] hover:text-[#9d8fff] px-0"
              onClick={(e) => {
                e.stopPropagation();
                onViewBoard?.();
              }}
            >
              <Map className="h-3 w-3 mr-1" />
              View Board Map
            </Button>
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="bg-zinc-900 border-zinc-800 text-zinc-100 w-96">
          <SheetHeader>
            <SheetTitle className="text-zinc-100 flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {config.label}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ComponentStatus)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {(["OK", "FAULTY", "REPLACED", "DEAD"] as ComponentStatus[]).map(
                    (s) => {
                      const cfg = COMPONENT_STATUS_CONFIG[s];
                      return (
                        <SelectItem
                          key={s}
                          value={s}
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

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this component..."
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
                rows={4}
              />
            </div>

            <Button
              className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white"
              onClick={handleSave}
              disabled={updateComponent.isPending}
            >
              {updateComponent.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>

            {isMainBoard && (
              <Button
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => {
                  setOpen(false);
                  onViewBoard?.();
                }}
              >
                <Map className="mr-2 h-4 w-4" />
                Open Board Map
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
