import { Skeleton } from "@/components/ui/skeleton";

export default function TicketsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-20 bg-zinc-800" />
        </div>
        <Skeleton className="h-9 w-32 bg-zinc-800 rounded-lg" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-64 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-44 bg-zinc-800 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
