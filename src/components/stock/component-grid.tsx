"use client";

import { COMPONENT_ORDER } from "@/lib/constants";
import { ComponentCard } from "./component-card";
import type { KitComponent } from "@/lib/types/database";

interface ComponentGridProps {
  components: KitComponent[];
  kitId: string;
  onViewBoard?: () => void;
}

export function ComponentGrid({ components, kitId, onViewBoard }: ComponentGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {COMPONENT_ORDER.map((type) => {
        const component = components.find((c) => c.component_type === type);
        if (!component) return null;
        return (
          <ComponentCard
            key={type}
            component={component}
            kitId={kitId}
            onViewBoard={type === "MAIN_BOARD" ? onViewBoard : undefined}
          />
        );
      })}
    </div>
  );
}
