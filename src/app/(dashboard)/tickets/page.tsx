"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketForm } from "@/components/tickets/ticket-form";
import { useTickets } from "@/hooks/use-tickets";
import {
  TICKET_STATUS_CONFIG,
  PRIORITY_CONFIG,
  ISSUE_CATEGORY_CONFIG,
} from "@/lib/constants";
import type { TicketStatus, TicketPriority, IssueCategory } from "@/lib/types/database";

export default function TicketsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | "ALL">("ALL");

  const { data: tickets, isLoading } = useTickets({
    search: search || undefined,
    status: statusFilter,
    priority: priorityFilter,
    issue_category: categoryFilter,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Tickets</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {tickets?.length ?? 0} ticket{tickets?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <TicketForm />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TicketStatus | "ALL")}
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="ALL" className="text-zinc-300 focus:bg-zinc-700">
              All Status
            </SelectItem>
            {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as TicketStatus[]).map(
              (s) => {
                const cfg = TICKET_STATUS_CONFIG[s];
                return (
                  <SelectItem
                    key={s}
                    value={s}
                    className="text-zinc-200 focus:bg-zinc-700"
                  >
                    <span className={cfg.color}>{cfg.label}</span>
                  </SelectItem>
                );
              }
            )}
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter}
          onValueChange={(v) =>
            setPriorityFilter(v as TicketPriority | "ALL")
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="ALL" className="text-zinc-300 focus:bg-zinc-700">
              All Priority
            </SelectItem>
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as TicketPriority[]).map(
              (p) => {
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <SelectItem
                    key={p}
                    value={p}
                    className="text-zinc-200 focus:bg-zinc-700"
                  >
                    <span className={cfg.color}>{cfg.label}</span>
                  </SelectItem>
                );
              }
            )}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) =>
            setCategoryFilter(v as IssueCategory | "ALL")
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="ALL" className="text-zinc-300 focus:bg-zinc-700">
              All Categories
            </SelectItem>
            {Object.entries(ISSUE_CATEGORY_CONFIG).map(([key, val]) => (
              <SelectItem
                key={key}
                value={key}
                className="text-zinc-200 focus:bg-zinc-700"
              >
                {val.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TicketTable tickets={tickets ?? []} isLoading={isLoading} />
    </div>
  );
}
