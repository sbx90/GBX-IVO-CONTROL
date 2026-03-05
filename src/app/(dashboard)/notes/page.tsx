"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/use-notes";
import type { Note, NoteColor } from "@/lib/types/database";

const COLORS: { value: NoteColor; bg: string; border: string; dot: string }[] = [
  { value: "zinc",   bg: "bg-zinc-800",         border: "border-zinc-700",    dot: "bg-zinc-400" },
  { value: "yellow", bg: "bg-yellow-950/60",    border: "border-yellow-700/50", dot: "bg-yellow-400" },
  { value: "blue",   bg: "bg-blue-950/60",      border: "border-blue-700/50", dot: "bg-blue-400" },
  { value: "green",  bg: "bg-green-950/60",     border: "border-green-700/50", dot: "bg-green-400" },
  { value: "red",    bg: "bg-red-950/60",       border: "border-red-700/50",  dot: "bg-red-400" },
  { value: "purple", bg: "bg-purple-950/60",    border: "border-purple-700/50", dot: "bg-purple-400" },
];

function colorConfig(color: NoteColor) {
  return COLORS.find(c => c.value === color) ?? COLORS[0];
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NoteCard({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const cfg = colorConfig(note.color as NoteColor);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing]);

  function handleBlur() {
    setEditing(false);
    if (draft.trim() === note.content.trim()) return;
    if (!draft.trim()) {
      deleteNote.mutate(note.id);
      return;
    }
    updateNote.mutate({ id: note.id, content: draft.trim() });
  }

  function handleColorChange(color: NoteColor) {
    updateNote.mutate({ id: note.id, color });
  }

  return (
    <div className={cn("group relative rounded-xl border p-4 flex flex-col gap-3 transition-all", cfg.bg, cfg.border)}>
      {/* Color picker + delete */}
      <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => handleColorChange(c.value)}
              className={cn("w-3.5 h-3.5 rounded-full transition-transform hover:scale-125", c.dot, note.color === c.value && "ring-2 ring-white/40 scale-110")}
            />
          ))}
        </div>
        <button
          onClick={() => deleteNote.mutate(note.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === "Escape") { setDraft(note.content); setEditing(false); } }}
          className="w-full bg-transparent text-zinc-100 text-sm resize-none outline-none min-h-[80px] leading-relaxed"
          rows={Math.max(3, draft.split("\n").length)}
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap cursor-text flex-1 min-h-[60px]"
        >
          {note.content || <span className="text-zinc-600 italic">Click to edit…</span>}
        </p>
      )}

      <p className="text-[10px] text-zinc-600 mt-auto">{formatRelative(note.updated_at)}</p>
    </div>
  );
}

export default function NotesPage() {
  const { data: notes = [], isLoading } = useNotes();
  const createNote = useCreateNote();
  const [newColor, setNewColor] = useState<NoteColor>("yellow");

  function handleAdd() {
    createNote.mutate({ content: "", color: newColor });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Notes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{notes.length} note{notes.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Color selector for new note */}
          <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            {COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setNewColor(c.value)}
                className={cn("w-4 h-4 rounded-full transition-transform hover:scale-125", c.dot, newColor === c.value && "ring-2 ring-white/40 scale-110")}
              />
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={createNote.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New Note
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-zinc-500 text-sm">No notes yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Click "New Note" to add your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {notes.map(note => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
