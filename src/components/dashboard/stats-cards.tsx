import { Package, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  totalKits: number;
  kitsOk: number;
  openTickets: number;
  deadKits: number;
}

const stats = (props: StatsCardsProps) => [
  {
    label: "Total Kits",
    value: props.totalKits,
    icon: Package,
    color: "text-[#16a34a]",
    bg: "bg-[#16a34a]/10",
  },
  {
    label: "Kits OK",
    value: props.kitsOk,
    icon: CheckCircle,
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  {
    label: "Open Tickets",
    value: props.openTickets,
    icon: AlertCircle,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    label: "Dead Kits",
    value: props.deadKits,
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
];

export function StatsCards(props: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats(props).map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-zinc-100 mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
