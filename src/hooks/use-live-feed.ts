"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type FeedItemSource = "note" | "task" | "comment";

export interface FeedItem {
  id: string;
  source: FeedItemSource;
  content: string;
  title?: string;
  ticket_id?: string;
  created_at: string;
  hasMention: boolean;
}

export function useLiveFeed() {
  return useQuery<FeedItem[]>({
    queryKey: ["live_feed"],
    staleTime: 0,
    refetchInterval: 10_000,
    queryFn: async () => {
      const supabase = createClient();
      const [notesRes, tasksRes, commentsRes] = await Promise.all([
        supabase
          .from("notes")
          .select("id, content, updated_at")
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("tasks")
          .select("id, title, description, created_at")
          .not("description", "is", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("ticket_comments")
          .select("id, content, created_at, ticket_id")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const items: FeedItem[] = [];

      for (const note of notesRes.data ?? []) {
        if (!note.content?.trim()) continue;
        items.push({
          id: `note-${note.id}`,
          source: "note",
          content: note.content,
          created_at: note.updated_at,
          hasMention: note.content.includes("@"),
        });
      }
      for (const task of tasksRes.data ?? []) {
        if (!task.description?.trim()) continue;
        items.push({
          id: `task-${task.id}`,
          source: "task",
          content: task.description,
          title: task.title,
          created_at: task.created_at,
          hasMention: task.description.includes("@"),
        });
      }
      for (const comment of commentsRes.data ?? []) {
        if (!comment.content?.trim()) continue;
        items.push({
          id: `comment-${comment.id}`,
          source: "comment",
          content: comment.content,
          ticket_id: comment.ticket_id,
          created_at: comment.created_at,
          hasMention: comment.content.includes("@"),
        });
      }

      return items.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}
