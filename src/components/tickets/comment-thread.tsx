import { formatRelativeDate } from "@/lib/utils";
import { isImageFile } from "@/lib/utils";
import type { TicketComment } from "@/lib/types/database";

interface CommentThreadProps {
  comments: TicketComment[];
}

export function CommentThread({ comments }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <p className="text-zinc-600 text-sm text-center py-4">
        No comments yet. Be the first to add a note.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => {
        const email = comment.author_id?.slice(0, 8) ?? "user";
        const initial = email[0]?.toUpperCase() ?? "U";

        return (
          <div key={comment.id} className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 flex-shrink-0 mt-0.5">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-400">
                  {email}
                </span>
                <span className="text-xs text-zinc-600">
                  {formatRelativeDate(comment.created_at)}
                </span>
              </div>
              <div className="bg-zinc-800 rounded-lg px-3 py-2.5">
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
              {comment.ticket_attachments &&
                comment.ticket_attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {comment.ticket_attachments.map((att) =>
                      isImageFile(att.file_type) ? (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.file_url}
                            alt={att.file_name}
                            className="h-16 w-16 rounded object-cover border border-zinc-700 hover:border-zinc-500"
                          />
                        </a>
                      ) : (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#16a34a] hover:underline"
                        >
                          {att.file_name}
                        </a>
                      )
                    )}
                  </div>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
