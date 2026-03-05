"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Loader2, AlertTriangle, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MentionTextarea } from "@/components/ui/mention-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchManufacturedItems, useCreateTicket } from "@/hooks/use-tickets";
import { useClients } from "@/hooks/use-clients";
import {
  ISSUE_CATEGORY_CONFIG,
  PRIORITY_CONFIG,
} from "@/lib/constants";
import type {
  IssueCategory,
  TicketPriority,
} from "@/lib/types/database";

interface TicketFormProps {
  defaultItemIds?: string[];
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function TicketForm({ defaultItemIds, trigger, onSuccess }: TicketFormProps) {
  const [open, setOpen] = useState(false);
  const createTicket = useCreateTicket();
  const { data: clients } = useClients();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueCategory, setIssueCategory] = useState<IssueCategory | "">("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [clientId, setClientId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Product search / selection
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{ id: string; part_number: string; serial_number: string; client_id: string | null }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [] } = useSearchManufacturedItems(searchQuery);

  // Pre-populate items if provided
  useEffect(() => {
    if (open && defaultItemIds && defaultItemIds.length > 0) {
      // Items will be pre-populated from parent if needed
    }
    if (!open) {
      // Reset on close
      setTitle("");
      setDescription("");
      setIssueCategory("");
      setPriority("MEDIUM");
      setClientId("");
      setSearchQuery("");
      setSelectedItems([]);
      setErrors({});
    }
  }, [open, defaultItemIds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addItem(item: { id: string; part_number: string; serial_number: string; client_id: string | null }) {
    if (selectedItems.find(i => i.id === item.id)) return;
    setSelectedItems(prev => [...prev, item]);
    // Auto-select client from first item that has one
    if (item.client_id && !clientId) setClientId(item.client_id);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function removeItem(id: string) {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  }

  const showPowerWarning = issueCategory === "POWER" || issueCategory === "WRONG_CONNECTOR";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (selectedItems.length === 0) errs.items = "Select at least one product";
    if (!title.trim()) errs.title = "Title is required";
    if (!issueCategory) errs.category = "Select a category";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    await createTicket.mutateAsync({
      manufactured_item_ids: selectedItems.map(i => i.id),
      client_id: clientId || undefined,
      title: title.trim(),
      description: description || undefined,
      issue_category: issueCategory as IssueCategory,
      priority,
    });
    setOpen(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* Products selector */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              Products
              {selectedItems.length > 1 && (
                <span className="ml-2 text-xs font-normal text-blue-400">
                  Combination issue ({selectedItems.length} items)
                </span>
              )}
            </Label>

            {/* Selected chips */}
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {selectedItems.map(item => (
                  <span
                    key={item.id}
                    className="flex items-center gap-1 px-2 py-0.5 bg-zinc-700 rounded text-xs font-mono text-zinc-200"
                  >
                    <span className="text-zinc-400">{item.part_number}</span>
                    <span>{item.serial_number}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
                placeholder="Search by serial number or part number…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              {/* Dropdown */}
              {searchOpen && searchResults.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full left-0 right-0 z-50 mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-52 overflow-y-auto"
                >
                  {searchResults.map(item => {
                    const alreadySelected = !!selectedItems.find(i => i.id === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addItem(item)}
                        disabled={alreadySelected}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-left transition-colors"
                      >
                        <span className="font-mono text-zinc-300">{item.serial_number}</span>
                        <span className="text-zinc-500 text-xs ml-2 truncate">{item.part_number}</span>
                        {item.lot_number && (
                          <span className="text-zinc-600 text-xs ml-2 shrink-0">{item.lot_number}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-500">
                  No items found
                </div>
              )}
            </div>
            {errors.items && <p className="text-red-400 text-xs">{errors.items}</p>}
          </div>

          {/* Client selector */}
          {clients && clients.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                Client <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 focus:bg-zinc-700">No client</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-zinc-200 focus:bg-zinc-700">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Title</Label>
            <Input
              placeholder="Brief description of the issue"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            {errors.title && <p className="text-red-400 text-xs">{errors.title}</p>}
          </div>

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Category</Label>
              <Select value={issueCategory} onValueChange={v => setIssueCategory(v as IssueCategory)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {Object.entries(ISSUE_CATEGORY_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key} className="text-zinc-200 focus:bg-zinc-700">{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-red-400 text-xs">{errors.category}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TicketPriority)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as TicketPriority[]).map(p => {
                    const cfg = PRIORITY_CONFIG[p];
                    return (
                      <SelectItem key={p} value={p} className="text-zinc-200 focus:bg-zinc-700">
                        <span className={cfg.color}>{cfg.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Power warning */}
          {showPowerWarning && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-400/10 border border-amber-400/30">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">⚠ Verify Power Connector</p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  Before continuing — has the power cable been verified to be in the LEFT connector (POWER_MAIN)?
                  The #1 installation error is plugging into the RIGHT connector (POWER_2).
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              Description <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <MentionTextarea
              value={description}
              onChange={setDescription}
              placeholder="Detailed description… use @ to mention someone"
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 placeholder:text-zinc-500 text-sm w-full"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-white" disabled={createTicket.isPending}>
              {createTicket.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : "Create Ticket"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
