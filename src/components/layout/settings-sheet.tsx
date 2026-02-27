"use client";

import { useTheme } from "next-themes";
import { Settings, Sun, Moon } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function SettingsSheet() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors w-full">
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </SheetTrigger>
      <SheetContent className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 w-80">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Settings</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Theme toggle */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Appearance
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-all",
                  theme === "light"
                    ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-all",
                  theme === "dark"
                    ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
