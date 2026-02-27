import { createClient } from "@/lib/supabase/server";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentTickets } from "@/components/dashboard/recent-tickets";
import { ProductionSummary } from "@/components/dashboard/production-summary";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch stats server-side in parallel
  const [
    { count: totalKits },
    { count: kitsOk },
    { count: openTickets },
    { count: deadKits },
  ] = await Promise.all([
    supabase.from("kits").select("*", { count: "exact", head: true }),
    supabase
      .from("kits")
      .select("*", { count: "exact", head: true })
      .eq("status", "OK"),
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .in("status", ["OPEN", "IN_PROGRESS"]),
    supabase
      .from("kits")
      .select("*", { count: "exact", head: true })
      .eq("status", "DEAD"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">
          GBX-IVO-CONTROL inventory overview
        </p>
      </div>

      <StatsCards
        totalKits={totalKits ?? 0}
        kitsOk={kitsOk ?? 0}
        openTickets={openTickets ?? 0}
        deadKits={deadKits ?? 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTickets />
        <ProductionSummary />
      </div>
    </div>
  );
}
