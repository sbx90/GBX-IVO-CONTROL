"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { LiveFeedPanel } from "@/components/layout/live-feed-panel";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [feedOpen, setFeedOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-gray-100 dark:bg-zinc-950 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          onToggleFeed={() => setFeedOpen((v) => !v)}
          feedOpen={feedOpen}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
      <LiveFeedPanel open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
}
