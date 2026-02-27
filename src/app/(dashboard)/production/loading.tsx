import { Skeleton } from "@/components/ui/skeleton";

export default function ProductionLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-zinc-800" />
          <Skeleton className="h-4 w-24 bg-zinc-800" />
        </div>
        <Skeleton className="h-9 w-32 bg-zinc-800 rounded-lg" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full bg-zinc-800 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
