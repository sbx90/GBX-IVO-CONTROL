"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AssembleKitDialog } from "@/components/kits/assemble-kit-dialog";
import { AssembledKitTable } from "@/components/kits/assembled-kit-table";
import { useAssembledKits } from "@/hooks/use-assembled-kits";
import type { AssembledKitStatus } from "@/lib/types/database";
import { ASSEMBLED_KIT_STATUS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

type StatusFilter = AssembledKitStatus | "ALL";

const STATUS_FILTERS: StatusFilter[] = [
  "ALL",
  "ASSEMBLING",
  "READY",
  "DEPLOYED",
  "RETURNED",
  "RETIRED",
];

export default function KitsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const { data: kits, isLoading } = useAssembledKits({
    search: search || undefined,
    status: statusFilter,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Kits</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {kits?.length ?? 0} kit{kits?.length !== 1 ? "s" : ""} assembled
          </p>
        </div>
        <AssembleKitDialog />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search kit numbers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                statusFilter === s
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {s === "ALL" ? "All" : ASSEMBLED_KIT_STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      <AssembledKitTable kits={kits ?? []} isLoading={isLoading} />
    </div>
  );
}
