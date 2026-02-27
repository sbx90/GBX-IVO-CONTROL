"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAINBOARD_LAYOUT,
  MAINBOARD_SECTION_CONFIG,
  COMPONENT_STATUS_CONFIG,
  ISSUE_CATEGORY_CONFIG,
} from "@/lib/constants";
import { cn, getStatusDot } from "@/lib/utils";
import type {
  MainboardSectionRecord,
  ComponentStatus,
  IssueCategory,
} from "@/lib/types/database";
import { useUpdateMainboardSection } from "@/hooks/use-kits";

interface MainboardMapProps {
  sections: MainboardSectionRecord[];
  kitId: string;
}

export function MainboardMap({ sections, kitId }: MainboardMapProps) {
  const [selected, setSelected] = useState<MainboardSectionRecord | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [status, setStatus] = useState<ComponentStatus>("OK");
  const [issueCategory, setIssueCategory] = useState<IssueCategory | "">("");
  const [notes, setNotes] = useState("");
  const updateSection = useUpdateMainboardSection();

  function openSection(section: MainboardSectionRecord | undefined, name: string) {
    setSelectedName(name);
    setSelected(section ?? null);
    setStatus(section?.status ?? "OK");
    setIssueCategory(section?.issue_category ?? "");
    setNotes(section?.notes ?? "");
  }

  async function handleSave() {
    if (!selected) return;
    await updateSection.mutateAsync({
      id: selected.id,
      kitId,
      updates: {
        status,
        issue_category: issueCategory || undefined,
        notes: notes || undefined,
      },
    });
    setSelected(null);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium text-zinc-300">Main Board Layout</p>
          <span className="text-xs text-zinc-500">— click a section to inspect</span>
        </div>

        {/* Board grid */}
        <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-4 space-y-2">
          {MAINBOARD_LAYOUT.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-2">
              {row.map((sectionName) => {
                const section = sections.find(
                  (s) => s.section_name === sectionName
                );
                const cfg = MAINBOARD_SECTION_CONFIG[sectionName];
                const isSingleRow = row.length === 1;
                const isPower2 = sectionName === "POWER_2";
                const isPowerMain = sectionName === "POWER_MAIN";

                return (
                  <button
                    key={sectionName}
                    onClick={() => openSection(section, sectionName)}
                    className={cn(
                      "relative rounded-lg border p-2.5 text-left transition-all hover:brightness-125 active:scale-95",
                      isSingleRow ? "flex-1" : "flex-1",
                      isPower2
                        ? "border-2 danger-pulse"
                        : isPowerMain
                        ? "border-green-500/50"
                        : cfg.borderColor,
                      cfg.bgColor
                    )}
                    style={
                      sectionName === "POWER_MAIN"
                        ? { flex: "0 0 60%" }
                        : sectionName === "POWER_2"
                        ? { flex: "0 0 38%" }
                        : undefined
                    }
                  >
                    {/* Status dot */}
                    {section && (
                      <div
                        className={cn(
                          "absolute top-2 right-2 h-2 w-2 rounded-full",
                          getStatusDot(section.status)
                        )}
                      />
                    )}

                    <div className="pr-4">
                      <p className={cn("text-xs font-bold", cfg.color)}>
                        {cfg.shortLabel}
                      </p>
                      {cfg.cameraMapping && (
                        <p className="text-xs text-zinc-500 leading-tight mt-0.5">
                          {cfg.cameraMapping.split("—")[0].trim()}
                        </p>
                      )}
                    </div>

                    {isPower2 && (
                      <AlertTriangle className="absolute bottom-2 right-2 h-3 w-3 text-red-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* POWER_2 permanent warning */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-400/8 border border-red-400/20">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              ⚠ Common Installation Error
            </p>
            <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">
              <strong>POWER_2 (right connector)</strong> is NOT the power input.
              Always connect power to <strong>POWER_MAIN (left connector)</strong>.
              Plugging into POWER_2 is the #1 reported installation error.
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          {(["OK", "FAULTY", "REPLACED", "DEAD"] as ComponentStatus[]).map(
            (s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={cn("h-2 w-2 rounded-full", getStatusDot(s))} />
                {COMPONENT_STATUS_CONFIG[s].label}
              </div>
            )
          )}
        </div>
      </div>

      {/* Section detail sheet */}
      <Sheet open={!!selectedName} onOpenChange={(o) => { if (!o) { setSelected(null); setSelectedName(null); } }}>
        <SheetContent className="bg-zinc-900 border-zinc-800 text-zinc-100 w-96">
          {selectedName && (() => {
            const cfg = MAINBOARD_SECTION_CONFIG[selectedName as keyof typeof MAINBOARD_SECTION_CONFIG];
            if (!selected) {
              return (
                <>
                  <SheetHeader>
                    <SheetTitle className="text-zinc-100">{cfg.label}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 flex items-start gap-3 p-4 rounded-lg bg-amber-400/8 border border-amber-400/20">
                    <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-300">Section not initialized</p>
                      <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">
                        This section was recently added. Run the SQL migration in Supabase to initialize it for existing kits.
                      </p>
                    </div>
                  </div>
                </>
              );
            }
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-zinc-100">
                    {cfg.label}
                  </SheetTitle>
                </SheetHeader>

                <div className="space-y-5 mt-6">
                  <p className="text-sm text-zinc-400">{cfg.description}</p>

                  {cfg.cameraMapping && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-400/8 border border-amber-400/20">
                      <p className="text-xs text-amber-300">
                        <strong>Camera port:</strong> {cfg.cameraMapping}
                      </p>
                    </div>
                  )}

                  {cfg.isDanger && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-400/10 border border-red-400/30">
                      <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-300">
                          DO NOT USE — Wrong Connector
                        </p>
                        <p className="text-xs text-red-400/80 mt-1">
                          This connector (POWER_2) is NOT the power input.
                          Power must be connected to POWER_MAIN (left). Using
                          this connector is a critical installation error.
                        </p>
                      </div>
                    </div>
                  )}

                  {cfg.isCorrectPower && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-400/8 border border-green-400/20">
                      <p className="text-xs text-green-300">
                        ✓ <strong>CORRECT connector</strong> — this is where
                        power should be connected (left side).
                      </p>
                    </div>
                  )}

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
                            const c = COMPONENT_STATUS_CONFIG[s];
                            return (
                              <SelectItem
                                key={s}
                                value={s}
                                className="text-zinc-200 focus:bg-zinc-700"
                              >
                                <span className={c.color}>{c.label}</span>
                              </SelectItem>
                            );
                          }
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-zinc-300">Issue Category</Label>
                    <Select
                      value={issueCategory}
                      onValueChange={(v) =>
                        setIssueCategory(v === "none" ? "" : v as IssueCategory)
                      }
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">
                          None
                        </SelectItem>
                        {Object.entries(ISSUE_CATEGORY_CONFIG).map(
                          ([key, val]) => (
                            <SelectItem
                              key={key}
                              value={key}
                              className="text-zinc-200 focus:bg-zinc-700"
                            >
                              {val.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes about this section..."
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
                      rows={3}
                    />
                  </div>

                  <Button
                    className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white"
                    onClick={handleSave}
                    disabled={updateSection.isPending}
                  >
                    {updateSection.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}
