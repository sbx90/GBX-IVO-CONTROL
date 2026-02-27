"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { KnownIssuesSuggest } from "@/components/tickets/known-issues-suggest";
import { AttachmentGallery } from "@/components/tickets/attachment-gallery";
import { AttachmentUpload } from "@/components/tickets/attachment-upload";
import { CommentThread } from "@/components/tickets/comment-thread";
import { CommentForm } from "@/components/tickets/comment-form";
import { useTicket } from "@/hooks/use-tickets";
import {
  PRIORITY_CONFIG,
  TICKET_STATUS_CONFIG,
  ISSUE_CATEGORY_CONFIG,
  COMPONENT_CONFIG,
  MAINBOARD_SECTION_CONFIG,
} from "@/lib/constants";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import type { MainboardSectionRecord, KitComponent } from "@/lib/types/database";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, isLoading } = useTicket(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full bg-zinc-800" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-32 bg-zinc-800" />
            <Skeleton className="h-48 bg-zinc-800" />
          </div>
          <Skeleton className="h-48 bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500">Ticket not found.</p>
        <Link href="/tickets" className="text-[#16a34a] text-sm mt-2 block">
          Back to tickets
        </Link>
      </div>
    );
  }

  const comments = ticket.ticket_comments ?? [];
  const allAttachments = ticket.ticket_attachments ?? [];
  // Only ticket-level attachments (not tied to comments)
  const ticketAttachments = allAttachments.filter((a) => !a.comment_id);
  const component = ticket.kit_components as KitComponent | null;
  const section = ticket.mainboard_sections as MainboardSectionRecord | null;

  return (
    <div className="space-y-5">
      <TicketDetailHeader ticket={ticket} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Known issues suggestion */}
          <KnownIssuesSuggest
            issueCategory={ticket.issue_category}
            boardSection={section?.section_name}
          />

          {/* Description */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.description ? (
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </p>
              ) : (
                <p className="text-sm text-zinc-600 italic">
                  No description provided.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          {ticketAttachments.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                  Attachments ({ticketAttachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AttachmentGallery attachments={ticketAttachments} />
              </CardContent>
            </Card>
          )}

          {/* Attach files */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Add Attachment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentUpload ticketId={ticket.id} />
            </CardContent>
          </Card>

          {/* Comments */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Comments ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <CommentThread comments={comments} />
              <Separator className="bg-zinc-800" />
              <CommentForm ticketId={ticket.id} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Status</span>
                <Badge
                  className={`text-xs ${TICKET_STATUS_CONFIG[ticket.status].bgColor} ${TICKET_STATUS_CONFIG[ticket.status].color} border-0`}
                >
                  {TICKET_STATUS_CONFIG[ticket.status].label}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Priority</span>
                <Badge
                  className={`text-xs ${PRIORITY_CONFIG[ticket.priority].bgColor} ${PRIORITY_CONFIG[ticket.priority].color} border-0`}
                >
                  {PRIORITY_CONFIG[ticket.priority].label}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Category</span>
                <span className="text-zinc-300 text-xs">
                  {ISSUE_CATEGORY_CONFIG[ticket.issue_category].label}
                </span>
              </div>
              {ticket.kits && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Kit</span>
                  <Link
                    href={`/stock/${ticket.kits.id}`}
                    className="font-mono text-xs text-[#16a34a] hover:text-[#9d8fff]"
                  >
                    {ticket.kits.serial_number}
                  </Link>
                </div>
              )}
              {component && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Component</span>
                  <span className="text-zinc-300 text-xs">
                    {COMPONENT_CONFIG[component.component_type].label}
                  </span>
                </div>
              )}
              {section && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Board Section</span>
                  <span className="text-zinc-300 text-xs">
                    {MAINBOARD_SECTION_CONFIG[section.section_name].shortLabel}
                  </span>
                </div>
              )}
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-400 text-xs">
                  {formatDate(ticket.created_at)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Updated</span>
                <span className="text-zinc-400 text-xs">
                  {formatRelativeDate(ticket.updated_at)}
                </span>
              </div>
              {ticket.resolved_at && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Resolved</span>
                  <span className="text-green-400 text-xs">
                    {formatDate(ticket.resolved_at)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
