"use client";

import { useRef, useState, useCallback, useEffect, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useTeamMembers } from "@/hooks/use-team-members";
import type { TeamMemberBasic } from "@/hooks/use-team-members";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/** Renders text with @mentions highlighted as blue chips */
export function MentionText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@\S+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-blue-400 font-medium">{part}</span>
        ) : (
          part
        )
      )}
    </span>
  );
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  ({ value, onChange, placeholder, className, rows = 3, autoFocus, onBlur, onKeyDown }, ref) => {
    const { data: members = [] } = useTeamMembers();
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number>(-1);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

    const filtered = mentionQuery !== null
      ? members.filter(m => {
          const name = (m.full_name ?? m.role ?? "").toLowerCase();
          return name.includes(mentionQuery.toLowerCase());
        })
      : [];

    useEffect(() => { setSelectedIdx(0); }, [mentionQuery]);

    const insertMention = useCallback((member: TeamMemberBasic) => {
      const name = member.full_name ?? member.role ?? member.id;
      const before = value.slice(0, mentionStart);
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
      const inserted = `@${name} `;
      onChange(before + inserted + after);
      setMentionQuery(null);
      setMentionStart(-1);
      // Restore focus and move cursor after the mention
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const pos = before.length + inserted.length;
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    }, [value, mentionStart, onChange, textareaRef]);

    function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const text = e.target.value;
      onChange(text);
      const cursor = e.target.selectionStart ?? text.length;
      const textBefore = text.slice(0, cursor);
      const atMatch = textBefore.match(/@(\S*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setMentionStart(cursor - atMatch[0].length);
      } else {
        setMentionQuery(null);
        setMentionStart(-1);
      }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (mentionQuery !== null && filtered.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filtered[selectedIdx]); return; }
        if (e.key === "Escape") { setMentionQuery(null); return; }
      }
      onKeyDown?.(e);
    }

    function handleBlur() {
      // Delay so click on dropdown registers first
      setTimeout(() => { setMentionQuery(null); onBlur?.(); }, 150);
    }

    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          className={cn(
            "w-full bg-transparent resize-none outline-none leading-relaxed",
            className
          )}
        />
        {mentionQuery !== null && filtered.length > 0 && (
          <div className="absolute z-50 left-0 bottom-full mb-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
            {filtered.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
                  i === selectedIdx ? "bg-zinc-700" : "hover:bg-zinc-700/60"
                )}
              >
                <div className="h-6 w-6 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-semibold text-zinc-200 flex-shrink-0">
                  {(m.full_name ?? m.role ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{m.full_name ?? `[${m.role ?? "user"}]`}</p>
                  {m.role && <p className="text-[10px] text-zinc-500 capitalize">{m.role.replace("_", " ")}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
MentionTextarea.displayName = "MentionTextarea";
