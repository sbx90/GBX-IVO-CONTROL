"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "@/components/ui/mention-textarea";
import { AttachmentUpload } from "./attachment-upload";
import { useAddComment } from "@/hooks/use-tickets";
import { toast } from "sonner";

interface CommentFormProps {
  ticketId: string;
}

export function CommentForm({ ticketId }: CommentFormProps) {
  const [content, setContent] = useState("");
  const [createdCommentId, setCreatedCommentId] = useState<string | undefined>();
  const addComment = useAddComment();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    const comment = await addComment.mutateAsync({ ticketId, content: content.trim() });
    setCreatedCommentId(comment.id);
    setContent("");
    toast.success("Comment added");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <MentionTextarea
        value={content}
        onChange={setContent}
        placeholder="Add a comment… use @ to mention someone"
        className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 placeholder:text-zinc-500 text-sm w-full"
        rows={3}
      />
      <AttachmentUpload
        ticketId={ticketId}
        commentId={createdCommentId}
        compact
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="bg-[#16a34a] hover:bg-[#15803d] text-white"
          disabled={!content.trim() || addComment.isPending}
        >
          {addComment.isPending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Posting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-3.5 w-3.5" />
              Post Comment
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
