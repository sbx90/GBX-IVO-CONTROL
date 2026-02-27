"use client";

import { useState } from "react";
import { Check, Loader2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  PRODUCTION_STEP_STATUS_CONFIG,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { useUpdateStep, useUpdateStepNotes } from "@/hooks/use-production";
import { cn } from "@/lib/utils";
import type { ProductionStep } from "@/lib/types/database";

interface StepCardProps {
  step: ProductionStep;
  isLast?: boolean;
  previousStepDone: boolean;
}

export function StepCard({ step, isLast = false, previousStepDone }: StepCardProps) {
  const [notes, setNotes] = useState(step.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const updateStep = useUpdateStep();
  const updateNotes = useUpdateStepNotes();

  const cfg = PRODUCTION_STEP_STATUS_CONFIG[step.status];
  const isDone = step.status === "DONE";
  const isActive = step.status === "ACTIVE";
  const isPending = step.status === "PENDING";
  const isSkipped = step.status === "SKIPPED";

  async function handleStart() {
    await updateStep.mutateAsync({ step, newStatus: "ACTIVE" });
  }

  async function handleComplete() {
    await updateStep.mutateAsync({ step, newStatus: "DONE" });
  }

  async function handleSkip() {
    await updateStep.mutateAsync({ step, newStatus: "SKIPPED" });
  }

  async function handleSaveNotes() {
    await updateNotes.mutateAsync({
      id: step.id,
      orderId: step.order_id,
      notes,
    });
    setEditingNotes(false);
  }

  return (
    <div className="flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 z-10",
            isActive && "ring-2 ring-blue-400/40 ring-offset-2 ring-offset-zinc-950",
            cfg.circleClass
          )}
        >
          {isDone ? (
            <Check className="h-4 w-4" />
          ) : isSkipped ? (
            <span className="line-through">{step.step_number}</span>
          ) : (
            step.step_number
          )}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 mt-1 mb-0",
              isDone ? "bg-green-500/40" : "bg-zinc-700"
            )}
          />
        )}
      </div>

      {/* Step content */}
      <div
        className={cn(
          "flex-1 pb-6",
          isLast ? "pb-2" : "",
          isActive &&
            "bg-blue-400/5 border border-blue-400/15 rounded-lg p-4 -ml-1"
        )}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  isDone
                    ? "text-green-300"
                    : isActive
                    ? "text-blue-200"
                    : isSkipped
                    ? "text-zinc-600 line-through"
                    : "text-zinc-200"
                )}
              >
                {step.step_name}
              </h3>
              <Badge
                className={`text-xs px-1.5 py-0 h-4 ${cfg.bgColor} ${cfg.color} border-0 flex-shrink-0`}
              >
                {cfg.label}
              </Badge>
            </div>
            {step.description && (
              <p className="text-xs text-zinc-500 leading-relaxed">
                {step.description}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {isPending && previousStepDone && (
              <>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={handleStart}
                  disabled={updateStep.isPending}
                >
                  {updateStep.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Start"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={handleSkip}
                  disabled={updateStep.isPending}
                >
                  <SkipForward className="h-3 w-3" />
                </Button>
              </>
            )}
            {isActive && (
              <Button
                size="sm"
                className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white"
                onClick={handleComplete}
                disabled={updateStep.isPending}
              >
                {updateStep.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Complete
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Timestamps */}
        {(step.started_at || step.completed_at) && (
          <div className="flex gap-4 mt-2 text-xs text-zinc-600">
            {step.started_at && (
              <span>Started: {formatDateTime(step.started_at)}</span>
            )}
            {step.completed_at && (
              <span className="text-green-600">
                Completed: {formatDateTime(step.completed_at)}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {(isActive || isDone || step.notes) && (
          <div className="mt-3">
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this step..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none text-xs"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-6 text-xs bg-[#16a34a] hover:bg-[#15803d] text-white"
                    onClick={handleSaveNotes}
                    disabled={updateNotes.isPending}
                  >
                    {updateNotes.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-zinc-400"
                    onClick={() => {
                      setNotes(step.notes ?? "");
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-zinc-600 hover:text-zinc-400 text-left"
              >
                {notes ? (
                  <span className="text-zinc-400">{notes}</span>
                ) : (
                  "+ Add notes"
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
