"use client";

import { usePathname } from "next/navigation";
import { PAGE_TITLES } from "@/lib/constants";

export function Header() {
  const pathname = usePathname();

  // Find most specific matching title
  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname === path || pathname.startsWith(path + "/"))?.[1] ??
    "GBX-IVO-CONTROL";

  return (
    <header className="h-14 flex items-center px-6 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{title}</h1>
    </header>
  );
}
