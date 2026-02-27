import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { ComponentStatus } from "./types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDate(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: string): string {
  return format(new Date(date), "MMM d, yyyy 'at' HH:mm");
}

export function getStatusDot(status: ComponentStatus): string {
  const map: Record<ComponentStatus, string> = {
    OK: "bg-green-400",
    FAULTY: "bg-amber-400",
    REPLACED: "bg-blue-400",
    DEAD: "bg-red-400",
  };
  return map[status] ?? "bg-zinc-400";
}

export function formatTicketNumber(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

export function isImageFile(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
