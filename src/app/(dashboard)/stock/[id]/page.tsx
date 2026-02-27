"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KitDetailHeader } from "@/components/stock/kit-detail-header";
import { ComponentGrid } from "@/components/stock/component-grid";
import { MainboardMap } from "@/components/stock/mainboard-map";
import { useKit } from "@/hooks/use-kits";
import {
  TICKET_STATUS_CONFIG,
  PRIORITY_CONFIG,
  ISSUE_CATEGORY_CONFIG,
} from "@/lib/constants";
import {
  formatRelativeDate,
  formatTicketNumber,
} from "@/lib/utils";
import Link from "next/link";
import type { Ticket } from "@/lib/types/database";

export default function KitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: kit, isLoading } = useKit(id);
  const [activeTab, setActiveTab] = useState("components");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full bg-zinc-800" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500">Kit not found.</p>
        <Link href="/stock" className="text-[#16a34a] text-sm mt-2 block">
          Back to stock
        </Link>
      </div>
    );
  }

  const components = kit.kit_components ?? [];
  const mainBoard = components.find((c) => c.component_type === "MAIN_BOARD");
  const sections = mainBoard?.mainboard_sections ?? [];
  const tickets = (kit.tickets ?? []).filter(
    (t): t is Ticket => "ticket_number" in t
  );

  return (
    <div className="space-y-6">
      <KitDetailHeader
        kit={kit}
        onCreateTicket={() => {
          window.location.href = `/tickets?create=1&kit_id=${kit.id}`;
        }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800 border border-zinc-700">
          <TabsTrigger
            value="components"
            className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-zinc-100"
          >
            Components
          </TabsTrigger>
          <TabsTrigger
            value="board"
            className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-zinc-100"
          >
            Board Map
          </TabsTrigger>
          <TabsTrigger
            value="tickets"
            className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-zinc-100"
          >
            Tickets{tickets.length > 0 ? ` (${tickets.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="mt-4">
          <ComponentGrid
            components={components}
            kitId={kit.id}
            onViewBoard={() => setActiveTab("board")}
          />
        </TabsContent>

        <TabsContent value="board" className="mt-4">
          {sections.length > 0 ? (
            <MainboardMap sections={sections} kitId={kit.id} />
          ) : (
            <p className="text-zinc-500 text-sm py-8 text-center">
              Main board sections loading...
            </p>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500 text-sm">No tickets for this kit.</p>
              <p className="text-zinc-600 text-xs mt-1">
                This kit is running clean ✓
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                      Ticket
                    </TableHead>
                    <TableHead className="text-zinc-400 text-xs uppercase tracking-wider">
                      Title
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => {
                    const priority = PRIORITY_CONFIG[ticket.priority];
                    const status = TICKET_STATUS_CONFIG[ticket.status];
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
                        <TableCell className="text-sm text-zinc-200">
                          {ticket.title}
                        </TableCell>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
