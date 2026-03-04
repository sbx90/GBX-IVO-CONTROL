"use client";

import { useState, useRef, useCallback } from "react";

function loadWidths(key: string, defaults: Record<string, number>): Record<string, number> {
  if (typeof window === "undefined") return defaults;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved) as Record<string, number>;
    // Merge: keep defaults for any new columns not yet in storage
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function useColumnResize(storageKey: string, initialWidths: Record<string, number>) {
  const [widths, setWidths] = useState(() => loadWidths(storageKey, initialWidths));
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback(
    (col: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = { col, startX: e.clientX, startW: widths[col] ?? 100 };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const { col, startX, startW } = resizingRef.current;
        const delta = ev.clientX - startX;
        setWidths((w) => ({ ...w, [col]: Math.max(40, startW + delta) }));
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Persist after drag ends
        setWidths((w) => {
          try { localStorage.setItem(storageKey, JSON.stringify(w)); } catch {}
          return w;
        });
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [widths]
  );

  return { widths, onResizeStart };
}
