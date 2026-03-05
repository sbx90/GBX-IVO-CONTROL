"use client";

import { StickyNote, CheckSquare, MessageSquare, Rss, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveFeed, FeedItem, FeedItemSource } from "@/hooks/use-live-feed";
import { MentionText } from "@/components/ui/mention-textarea";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SOURCE_CONFIG: Record<FeedItemSource, { icon: React.ReactNode; label: string; color: string }> = {
  note: { icon: <StickyNote className="h-3 w-3" />, label: "Note", color: "text-yellow-400" },
  task: { icon: <CheckSquare className="h-3 w-3" />, label: "Task", color: "text-blue-400" },
  comment: { icon: <MessageSquare className="h-3 w-3" />, label: "Comment", color: "text-green-400" },
};

function extractMentions(text: string): string[] {
  const matches = text.match(/@\S+/g) ?? [];
  return [...new Set(matches)];
}

function FeedCard({ item }: { item: FeedItem }) {
  const cfg = SOURCE_CONFIG[item.source];
  const excerpt = item.content.length > 140 ? item.content.slice(0, 140) + "…" : item.content;
  const tagged = extractMentions(item.content);

  return (
    <div
      className={cn(
        "px-3 py-2.5 border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors",
        item.hasMention && "border-l-2 border-l-blue-500/50 pl-2.5"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", cfg.color)}>
          {cfg.icon}
          {cfg.label}
        </span>
        <span className="text-[10px] text-zinc-600">{formatRelative(item.created_at)}</span>
      </div>
      {item.title && (
        <p className="text-[11px] text-zinc-400 mb-0.5 truncate font-medium">{item.title}</p>
      )}
      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
        <MentionText text={excerpt} />
      </p>
      {tagged.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[10px] text-zinc-500 font-medium">Tagged:</span>
          {tagged.map((t) => (
            <span
              key={t}
              className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full font-medium"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface LiveFeedPanelProps {
  open: boolean;
  onClose: () => void;
}

export function LiveFeedPanel({ open, onClose }: LiveFeedPanelProps) {
  const { data: items = [], isLoading, refetch, isFetching } = useLiveFeed();
  const mentionCount = items.filter((i) => i.hasMention).length;

  return (
    <div
      className={cn(
        "h-screen flex-shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden",
        open ? "w-72" : "w-0"
      )}
    >
      {open && (
        <>
          <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Rss className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-zinc-100">Live Feed</span>
              {mentionCount > 0 && (
                <span className="bg-blue-500/20 text-blue-400 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                  {mentionCount} @
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                title="Refresh"
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </button>
              <button
                onClick={onClose}
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-px mt-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-3 py-3 border-b border-zinc-800/60">
                    <div className="h-2 w-14 bg-zinc-800 rounded animate-pulse mb-2" />
                    <div className="h-3 w-full bg-zinc-800 rounded animate-pulse mb-1.5" />
                    <div className="h-3 w-3/4 bg-zinc-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Rss className="h-8 w-8 text-zinc-700 mb-3" />
                <p className="text-zinc-500 text-sm">No activity yet</p>
                <p className="text-zinc-700 text-xs mt-1">
                  Notes, tasks, and comments will appear here
                </p>
              </div>
            ) : (
              <div>
                {items.map((item) => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
