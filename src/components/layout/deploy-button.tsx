"use client";

import { useState, useEffect, useRef } from "react";
import { Rocket, Loader2, CheckCircle, XCircle, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type State = "idle" | "deploying" | "success" | "error";
type DeployState = "QUEUED" | "INITIALIZING" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | "UNKNOWN";

const POLL_INTERVAL = 4000;

export function DeployButton() {
  const [state, setState] = useState<State>("idle");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployState, setDeployState] = useState<DeployState>("UNKNOWN");
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (!deploymentId || state !== "deploying") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/deploy/status?id=${deploymentId}`);
        const data = await res.json();

        setDeployState(data.state);
        if (data.logs?.length) setLogs(data.logs);

        if (data.state === "READY") {
          clearInterval(pollRef.current!);
          setState("success");
          if (data.url) setLiveUrl(data.url);
          toast.success("Deployment complete! Live now.");
          setTimeout(() => { setState("idle"); setShowLogs(false); }, 10000);
        } else if (data.state === "ERROR" || data.state === "CANCELED") {
          clearInterval(pollRef.current!);
          setState("error");
          toast.error(`Deployment ${data.state.toLowerCase()}`);
        }
      } catch {
        // silently continue polling
      }
    }, POLL_INTERVAL);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deploymentId, state]);

  async function handleDeploy() {
    if (state === "deploying") return;
    setState("deploying");
    setDeployState("QUEUED");
    setLogs([]);
    setLiveUrl(null);
    setShowLogs(true);

    try {
      const res = await fetch("/api/deploy", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deploy failed");
      setDeploymentId(data.deploymentId);
      toast.success("Deployment triggered!");
    } catch (err: unknown) {
      setState("error");
      const message = err instanceof Error ? err.message : "Deploy failed";
      toast.error(message);
      setLogs([`Error: ${message}`]);
      setTimeout(() => { setState("idle"); setShowLogs(false); }, 6000);
    }
  }

  const stateLabel: Record<DeployState, string> = {
    QUEUED: "Queued...",
    INITIALIZING: "Initializing...",
    BUILDING: "Building...",
    READY: "Ready",
    ERROR: "Failed",
    CANCELED: "Canceled",
    UNKNOWN: "Deploying...",
  };

  const isActive = state === "deploying" || state === "success" || state === "error";

  return (
    <div className="px-3 pb-1 space-y-1">
      <button
        onClick={handleDeploy}
        disabled={state === "deploying"}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full",
          state === "idle" && "text-[#16a34a] hover:bg-[#16a34a]/10",
          state === "deploying" && "text-zinc-400 cursor-not-allowed",
          state === "success" && "text-green-400 hover:bg-green-400/10",
          state === "error" && "text-red-400 hover:bg-red-400/10"
        )}
      >
        {state === "deploying" ? (
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
        ) : state === "success" ? (
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
        ) : state === "error" ? (
          <XCircle className="h-4 w-4 flex-shrink-0" />
        ) : (
          <Rocket className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="flex-1">
          {state === "deploying"
            ? stateLabel[deployState]
            : state === "success"
            ? "Deployed!"
            : state === "error"
            ? "Deploy failed"
            : "Deploy to Live"}
        </span>
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowLogs((v) => !v); }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title={showLogs ? "Hide logs" : "Show logs"}
          >
            {showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </button>

      {/* Log panel */}
      {isActive && showLogs && (
        <div className="mx-1 rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
            <span className="text-[10px] font-mono font-semibold text-zinc-400 uppercase tracking-wider">
              Build Log
            </span>
            <span className={cn(
              "text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded",
              deployState === "READY" ? "bg-green-500/15 text-green-400" :
              deployState === "ERROR" || deployState === "CANCELED" ? "bg-red-500/15 text-red-400" :
              "bg-amber-500/15 text-amber-400"
            )}>
              {deployState}
            </span>
          </div>
          <div
            ref={logsRef}
            className="h-40 overflow-y-auto p-2 space-y-0.5"
          >
            {logs.length === 0 ? (
              <p className="text-[11px] font-mono text-zinc-600 animate-pulse">Waiting for build output...</p>
            ) : (
              logs.map((line, i) => (
                <p key={i} className={cn(
                  "text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all",
                  line.toLowerCase().includes("error") ? "text-red-400" :
                  line.toLowerCase().includes("warn") ? "text-amber-400" :
                  "text-zinc-300"
                )}>
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {state === "success" && liveUrl && (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{liveUrl.replace("https://", "")}</span>
        </a>
      )}
    </div>
  );
}
