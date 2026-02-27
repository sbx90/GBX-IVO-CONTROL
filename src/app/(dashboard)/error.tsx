"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <h2 className="text-xl font-semibold text-zinc-100">
        Something went wrong
      </h2>
      <p className="text-zinc-400 text-sm text-center max-w-sm">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button
        onClick={reset}
        className="bg-[#16a34a] hover:bg-[#15803d] text-white"
      >
        Try again
      </Button>
    </div>
  );
}
