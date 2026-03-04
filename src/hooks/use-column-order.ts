"use client";

import { useState, useRef } from "react";

function loadOrder(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved) as string[];
    // Keep any new default columns not yet saved, appended at the end
    const missing = defaults.filter((k) => !parsed.includes(k));
    return [...parsed.filter((k) => defaults.includes(k)), ...missing];
  } catch {
    return defaults;
  }
}

export function useColumnOrder(storageKey: string, defaultOrder: string[]) {
  const [order, setOrder] = useState(() => loadOrder(storageKey, defaultOrder));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragNodeRef = useRef<string | null>(null);

  function onDragStart(key: string) {
    dragNodeRef.current = key;
    // Tiny delay so the drag ghost renders before opacity change
    setTimeout(() => setDragging(key), 0);
  }

  function onDragOver(key: string, e: React.DragEvent) {
    e.preventDefault();
    if (key !== dragNodeRef.current) setDragOver(key);
  }

  function onDrop(targetKey: string) {
    const from = dragNodeRef.current;
    if (!from || from === targetKey) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function onDragEnd() {
    dragNodeRef.current = null;
    setDragging(null);
    setDragOver(null);
  }

  function onDragLeave(key: string) {
    setDragOver((prev) => (prev === key ? null : prev));
  }

  return { order, dragging, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave };
}
