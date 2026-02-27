"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTickets } from "@/hooks/use-tickets";
import { PRIORITY_CONFIG, TICKET_STATUS_CONFIG } from "@/lib/constants";
import { formatRelativeDate, formatTicketNumber } from "@/lib/utils";

export function RecentTickets() {
  const { data: tickets, isLoading } = useTickets();
  const recentTickets = tickets?.slice(0, 5) ?? [];

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-100">
          Recent Tickets
        </CardTitle>
        <Link
          href="/tickets"
          className="text-xs text-[#16a34a] hover:text-[#9d8fff] flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-zinc-800" />
            ))}
          </div>
        ) : recentTickets.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">No tickets yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Kits are looking healthy 🎉
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTickets.map((ticket) => {
              const priority = PRIORITY_CONFIG[ticket.priority];
              const status = TICKET_STATUS_CONFIG[ticket.status];
              return (
                <Link
                  key={ticket.id}
                  href={`/tickets/${ticket.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-zinc-500">
                        {formatTicketNumber(ticket.ticket_number)}
                      </span>
                      <Badge
                        className={`text-xs px-1.5 py-0 h-4 ${priority.bgColor} ${priority.color} border-0`}
                      >
                        {priority.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-200 truncate group-hover:text-white">
                      {ticket.title}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <Badge
                      className={`text-xs px-1.5 py-0 h-4 ${status.bgColor} ${status.color} border-0 mb-1`}
                    >
                      {status.label}
                    </Badge>
                    <p className="text-xs text-zinc-600">
                      {formatRelativeDate(ticket.created_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
