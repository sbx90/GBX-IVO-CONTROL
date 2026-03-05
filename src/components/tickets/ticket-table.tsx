"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TICKET_STATUS_CONFIG,
  PRIORITY_CONFIG,
  ISSUE_CATEGORY_CONFIG,
} from "@/lib/constants";
import { formatRelativeDate, formatTicketNumber } from "@/lib/utils";
import type { Ticket } from "@/lib/types/database";

interface TicketTableProps {
  tickets: Ticket[];
  isLoading?: boolean;
}

export function TicketTable({ tickets, isLoading }: TicketTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">No tickets found.</p>
        <p className="text-zinc-600 text-xs mt-1">
          All kits appear to be healthy.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider w-20">
              #
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Title
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Items
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Category
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Priority
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
              Created
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const priority = PRIORITY_CONFIG[ticket.priority];
            const status = TICKET_STATUS_CONFIG[ticket.status];
            const linkedItems = ticket.ticket_manufactured_items ?? [];

            // Determine what to show in Items column
            let itemsCell: React.ReactNode;
            if (linkedItems.length > 0) {
              if (linkedItems.length === 1) {
                const item = linkedItems[0].manufactured_items;
                itemsCell = item ? (
                  <span className="text-xs font-mono text-zinc-400">
                    <span className="text-zinc-500">{item.part_number}</span>{" "}
                    {item.serial_number}
                  </span>
                ) : <span className="text-zinc-600 text-xs">—</span>;
              } else {
                itemsCell = (
                  <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                    {linkedItems.length} items
                  </span>
                );
              }
            } else if (ticket.manufactured_items) {
              const item = ticket.manufactured_items;
              itemsCell = (
                <span className="text-xs font-mono text-zinc-400">
                  <span className="text-zinc-500">{item.part_number}</span>{" "}
                  {item.serial_number}
                </span>
              );
            } else if (ticket.kits) {
              itemsCell = <span className="text-xs font-mono text-zinc-400">{ticket.kits.serial_number}</span>;
            } else {
              itemsCell = <span className="text-zinc-600 text-xs">—</span>;
            }

            return (
              <TableRow
                key={ticket.id}
                className="border-zinc-800 hover:bg-zinc-800/50"
              >
                <TableCell>
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="font-mono text-sm text-[#16a34a] hover:text-[#9d8fff]"
                  >
                    {formatTicketNumber(ticket.ticket_number)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-xs">
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="text-sm text-zinc-200 hover:text-white truncate block"
                  >
                    {ticket.title}
                  </Link>
                </TableCell>
                <TableCell>{itemsCell}</TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-400">
                    {ISSUE_CATEGORY_CONFIG[ticket.issue_category].label}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${priority.bgColor} ${priority.color} border-0`}
                  >
                    {priority.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${status.bgColor} ${status.color} border-0`}
                  >
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatRelativeDate(ticket.created_at)}
                </TableCell>
                <TableCell>
                  <Link href={`/tickets/${ticket.id}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
