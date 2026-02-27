"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIT_STATUS_CONFIG, KIT_TYPE_CONFIG } from "@/lib/constants";
import { useUpdateKit, useDeleteKit } from "@/hooks/use-kits";
import type { Kit, KitStatus } from "@/lib/types/database";

interface KitDetailHeaderProps {
  kit: Kit;
  onCreateTicket?: () => void;
}

export function KitDetailHeader({ kit, onCreateTicket }: KitDetailHeaderProps) {
  const router = useRouter();
  const updateKit = useUpdateKit();
  const deleteKit = useDeleteKit();
  const status = KIT_STATUS_CONFIG[kit.status];
  const type = KIT_TYPE_CONFIG[kit.type];

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-4">
        <Link href="/stock">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-zinc-100 -ml-1 mt-0.5"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Stock
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono text-zinc-100">
              {kit.serial_number}
            </h1>
            <Badge className={`text-sm ${type.bgColor} ${type.color} border-0`}>
              {type.label}
            </Badge>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${status.dotColor}`} />
              <Badge
                className={`text-sm ${status.bgColor} ${status.color} border-0`}
              >
                {status.label}
              </Badge>
            </div>
          </div>
          {kit.notes && (
            <p className="text-sm text-zinc-500 mt-1">{kit.notes}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          className="h-9 w-9 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
          disabled={deleteKit.isPending}
          onClick={() => {
            if (confirm(`Delete kit ${kit.serial_number}? This cannot be undone.`)) {
              deleteKit.mutate(kit.id, { onSuccess: () => router.push("/stock") });
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <Select
          value={kit.status}
          onValueChange={(v) =>
            updateKit.mutate({ id: kit.id, updates: { status: v as KitStatus } })
          }
        >
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 w-36 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {(["OK", "TICKET", "DEAD"] as KitStatus[]).map((s) => {
              const cfg = KIT_STATUS_CONFIG[s];
              return (
                <SelectItem
                  key={s}
                  value={s}
                  className="text-zinc-200 focus:bg-zinc-700"
                >
                  <span className={cfg.color}>{cfg.label}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Button
          className="bg-[#16a34a] hover:bg-[#15803d] text-white h-9"
          onClick={onCreateTicket}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Ticket
        </Button>
      </div>
    </div>
  );
}
