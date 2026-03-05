"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  TicketIcon,
  Factory,
  Archive,
  CheckSquare,
  Layers,
  LogOut,
  ListTodo,
  StickyNote,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { DeployButton } from "@/components/layout/deploy-button";
import { useProfile } from "@/hooks/use-profile";
import { canAccess, ROLE_CONFIG } from "@/lib/permissions";

type NavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: "tickets" | "tasks";
};

const navItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/production", icon: Factory, label: "Production" },
  { href: "/lots", icon: Archive, label: "Lots" },
  { href: "/manufactured", icon: CheckSquare, label: "Manufactured" },
  { href: "/stock", icon: Package, label: "Stock" },
  { href: "/tickets", icon: TicketIcon, label: "Tickets", badge: "tickets" },
  { href: "/tasks", icon: ListTodo, label: "Tasks", badge: "tasks" },
  { href: "/notes", icon: StickyNote, label: "Notes" },
];


export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [openTicketCount, setOpenTicketCount] = useState<number>(0);
  const [overdueTaskCount, setOverdueTaskCount] = useState<number>(0);
  const { data: profile } = useProfile();

  const roleConfig = profile?.role ? ROLE_CONFIG[profile.role] : null;

  const visibleNavItems = navItems.filter(
    ({ href }) => !profile?.role || canAccess(profile.role, href)
  );


  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);

      const { count: ticketCount } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["OPEN", "IN_PROGRESS"]);
      setOpenTicketCount(ticketCount ?? 0);

      const today = new Date().toISOString().split("T")[0];
      const { count: taskCount } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .neq("status", "DONE")
        .lte("due_date", today)
        .not("due_date", "is", null);
      setOverdueTaskCount(taskCount ?? 0);
    }

    loadData();

    const channel = supabase
      .channel("sidebar-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .in("status", ["OPEN", "IN_PROGRESS"])
          .then(({ count }) => setOpenTicketCount(count ?? 0));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        const today = new Date().toISOString().split("T")[0];
        supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .neq("status", "DONE")
          .lte("due_date", today)
          .not("due_date", "is", null)
          .then(({ count }) => setOverdueTaskCount(count ?? 0));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
  }

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-screen bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-gray-200 dark:border-zinc-800">
        <span className="text-xl font-bold text-[#15803d] tracking-tight">
          GBX-IVO-CONTROL
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map(({ href, icon: Icon, label, badge }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#16a34a]/15 text-[#16a34a]"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 uppercase">{label}</span>
              {badge === "tickets" && openTicketCount > 0 && (
                <Badge className="bg-amber-400/15 text-amber-400 border border-amber-400/20 text-xs px-1.5 py-0 h-5">
                  {openTicketCount}
                </Badge>
              )}
              {badge === "tasks" && overdueTaskCount > 0 && (
                <Badge className="bg-red-400/15 text-red-400 border border-red-400/20 text-xs px-1.5 py-0 h-5">
                  {overdueTaskCount}
                </Badge>
              )}
            </Link>
          );
        })}

      </nav>

      <Separator className="bg-gray-200 dark:bg-zinc-800" />

      {/* Bottom section */}
      <div className="p-3 space-y-1">
        {roleConfig?.canDeploy && <DeployButton />}
        {roleConfig?.canAccessSettings && <SettingsDialog />}

        <Separator className="bg-gray-200 dark:bg-zinc-800 my-2" />

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-zinc-300 flex-shrink-0">
            {userEmail?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">
              {userEmail ?? "Loading..."}
            </span>
            {roleConfig && (
              <span className="text-[10px] text-[#16a34a] font-medium">
                {roleConfig.label}
              </span>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="text-gray-400 dark:text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
