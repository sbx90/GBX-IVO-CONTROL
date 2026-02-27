"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_STATUS_CONFIG,
  PRIORITY_CONFIG,
} from "@/lib/constants";
import { useUpdateTicket, useDeleteTicket } from "@/hooks/use-tickets";
import { formatTicketNumber } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/lib/types/database";

interface TicketDetailHeaderProps {
  ticket: Ticket;
}

export function TicketDetailHeader({ ticket }: TicketDetailHeaderProps) {
  const router = useRouter();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const status = TICKET_STATUS_CONFIG[ticket.status];
  const priority = PRIORITY_CONFIG[ticket.priority];

  return (
    <div className="space-y-3">
      <Link href="/tickets">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-100 -ml-1"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Tickets
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono text-lg font-bold text-zinc-400">
              {formatTicketNumber(ticket.ticket_number)}
            </span>
            <Badge
              className={`text-sm ${priority.bgColor} ${priority.color} border-0`}
            >
              {priority.label}
            </Badge>
            <Badge
              className={`text-sm ${status.bgColor} ${status.color} border-0`}
            >
              {status.label}
            </Badge>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">{ticket.title}</h1>
          {ticket.kits && (
            <p className="text-sm text-zinc-500 mt-1">
              Kit:{" "}
              <Link
                href={`/stock/${ticket.kits.id}`}
                className="text-[#16a34a] hover:text-[#9d8fff] font-mono"
              >
                {ticket.kits.serial_number}
              </Link>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
            disabled={deleteTicket.isPending}
            onClick={() => {
              if (confirm(`Delete ticket ${formatTicketNumber(ticket.ticket_number)}? This cannot be undone.`)) {
                deleteTicket.mutate(ticket.id, { onSuccess: () => router.push("/tickets") });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Select
            value={ticket.status}
            onValueChange={(v) =>
              updateTicket.mutate({
                id: ticket.id,
                updates: { status: v as TicketStatus },
              })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
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
        </div>
      </div>
    </div>
  );
}
