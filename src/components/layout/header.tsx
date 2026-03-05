"use client";

import { usePathname } from "next/navigation";
import { Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_TITLES } from "@/lib/constants";

interface HeaderProps {
  onToggleFeed?: () => void;
  feedOpen?: boolean;
}

export function Header({ onToggleFeed, feedOpen }: HeaderProps) {
  const pathname = usePathname();

  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname === path || pathname.startsWith(path + "/"))?.[1] ??
    "GBX-IVO-CONTROL";

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{title}</h1>
      {onToggleFeed && (
        <button
          onClick={onToggleFeed}
          title="Live Feed"
          className={cn(
            "p-2 rounded-lg transition-colors",
            feedOpen
              ? "text-blue-400 bg-blue-500/10"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          )}
        >
          <Rss className="h-4 w-4" />
        </button>
      )}
    </header>
  );
}
