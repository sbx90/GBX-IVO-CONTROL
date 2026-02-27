import { StepCard } from "./step-card";
import type { ProductionStep } from "@/lib/types/database";

interface StepPipelineProps {
  steps: ProductionStep[];
}

export function StepPipeline({ steps }: StepPipelineProps) {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="space-y-0">
      {sorted.map((step, i) => {
        const previousStep = sorted[i - 1];
        const previousStepDone =
          i === 0 || previousStep?.status === "DONE" || previousStep?.status === "SKIPPED";

        return (
          <StepCard
            key={step.id}
            step={step}
            isLast={i === sorted.length - 1}
            previousStepDone={previousStepDone}
          />
        );
      })}
    </div>
  );
}
