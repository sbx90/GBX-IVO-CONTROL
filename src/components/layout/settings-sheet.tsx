"use client";

import { useTheme } from "next-themes";
import { Settings, Sun, Moon, Pencil, Check, X, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { listTeamMembers, updateTeamMemberName } from "@/app/actions/users";

function TeamMemberRow({ member }: { member: { id: string; email: string; full_name: string | null; role: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.full_name ?? "");
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  function handleSave() {
    startTransition(async () => {
      await updateTeamMemberName(member.id, name);
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["team_members_admin"] });
      setEditing(false);
    });
  }

  function handleCancel() {
    setName(member.full_name ?? "");
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-zinc-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        ) : (
          <p className={cn("text-sm truncate", member.full_name ? "text-zinc-200" : "text-zinc-600 italic")}>
            {member.full_name ?? "No name set"}
          </p>
        )}
        <p className="text-[11px] text-zinc-500 truncate mt-0.5">{member.email}</p>
      </div>
      <span className="text-[10px] text-zinc-600 capitalize flex-shrink-0">
        {member.role?.replace("_", " ")}
      </span>
      {editing ? (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="p-1 text-green-400 hover:text-green-300 transition-colors"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={handleCancel} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SettingsSheet() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["team_members_admin"],
    queryFn: () => listTeamMembers(),
    enabled: open && isAdmin,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors w-full">
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </SheetTrigger>
      <SheetContent className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 w-80">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Settings</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Theme toggle */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Appearance
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-all",
                  theme === "light"
                    ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-all",
                  theme === "dark"
                    ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </div>

          {/* Team members (admin only) */}
          {isAdmin && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Team Members
              </p>
              {loadingMembers ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-zinc-800 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div>
                  {members.map((m) => (
                    <TeamMemberRow key={m.id} member={m} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
