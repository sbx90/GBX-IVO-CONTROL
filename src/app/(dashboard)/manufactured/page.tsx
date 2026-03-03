"use client";

import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useManufacturedItemsPaginated,
  useCreateManufacturedItem,
  useUpdateManufacturedItem,
  useDeleteManufacturedItem,
  useDeleteAllManufacturedItems,
} from "@/hooks/use-manufactured";
import { useClients } from "@/hooks/use-clients";
import { formatDate } from "@/lib/utils";
import type { ManufacturedItem, ManufacturedItemStatus, ManufacturedItemLocation } from "@/lib/types/database";

// ─── Constants ─────────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200];

const STATUS_CONFIG: Record<ManufacturedItemStatus, { label: string; className: string }> = {
  CREATED:    { label: "Created",     className: "bg-teal-500/15 text-teal-400 border-0" },
  IN_PROCESS: { label: "In Process",  className: "bg-yellow-500/15 text-yellow-400 border-0" },
  IN_TRANSIT: { label: "In Transit",  className: "bg-sky-500/15 text-sky-400 border-0" },
  AT_CLIENT:  { label: "@Client",     className: "bg-green-500/15 text-green-400 border-0" },
  RETURNED:   { label: "Returned",    className: "bg-amber-400/15 text-amber-400 border-0" },
  BAD:        { label: "Bad",         className: "bg-red-500/15 text-red-400 border-0" },
  MANUAL:     { label: "Manual",      className: "bg-purple-500/15 text-purple-400 border-0" },
};

const ALL_STATUSES: ManufacturedItemStatus[] = ["CREATED", "IN_PROCESS", "IN_TRANSIT", "AT_CLIENT", "RETURNED", "BAD", "MANUAL"];
type FilterStatus = ManufacturedItemStatus | "ALL";

const ALL_LOCATIONS: ManufacturedItemLocation[] = ["SUPPLIER", "GBX", "CLIENT"];

const LOCATION_CONFIG: Record<ManufacturedItemLocation, { label: string; className: string }> = {
  SUPPLIER: { label: "Supplier", className: "bg-zinc-700 text-zinc-400 border-0" },
  GBX:      { label: "GBX",      className: "bg-green-500/15 text-green-400 border-0" },
  CLIENT:   { label: "Client",   className: "bg-blue-500/15 text-blue-400 border-0" },
};

interface ItemFormState {
  part_number: string;
  serial_number: string;
  lot_number: string;
  status: ManufacturedItemStatus;
  client_id: string;
  location: ManufacturedItemLocation;
}

const EMPTY_FORM: ItemFormState = {
  part_number: "",
  serial_number: "",
  lot_number: "",
  status: "CREATED",
  client_id: "none",
  location: "GBX",
};

function fmt(n: number) { return n.toLocaleString(); }

// ─── Page ──────────────────────────────────────────────────────────

export default function ManufacturedPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterClientId, setFilterClientId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => { setPage(0); }, [filterStatus, debouncedSearch, filterClientId, pageSize]);

  const { data: pageData, isLoading, isFetching } = useManufacturedItemsPaginated({
    page, pageSize, status: filterStatus, search: debouncedSearch, clientId: filterClientId,
  });
  const { data: clients = [] } = useClients();

  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  const createItem = useCreateManufacturedItem();
  const updateItem = useUpdateManufacturedItem();
  const deleteItem = useDeleteManufacturedItem();
  const deleteAll = useDeleteAllManufacturedItems();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManufacturedItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(item: ManufacturedItem) {
    setEditing(item);
    setForm({ part_number: item.part_number, serial_number: item.serial_number, lot_number: item.lot_number ?? "", status: item.status, client_id: item.client_id ?? "none", location: item.location ?? "GBX" });
    setDialogOpen(true);
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      part_number: form.part_number.trim(),
      serial_number: form.serial_number.trim(),
      lot_number: form.lot_number.trim() || undefined,
      status: form.status,
      client_id: form.client_id !== "none" ? form.client_id : undefined,
      location: form.location,
    };
    if (editing) await updateItem.mutateAsync({ id: editing.id, updates: payload });
    else await createItem.mutateAsync(payload);
    setDialogOpen(false);
  }
  function handleDelete(item: ManufacturedItem) {
    if (confirm(`Delete ${item.part_number} S/N ${item.serial_number}?`)) deleteItem.mutate(item.id);
  }
  function handleDeleteAll() {
    if (confirm(`Delete ALL ${fmt(total)} manufactured items? This cannot be undone.`)) deleteAll.mutate();
  }

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Manufactured</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total > 0 ? `${fmt(total)} items tracked` : "No items yet"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {total > 0 && (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400 hover:bg-red-400/10 gap-1.5" disabled={deleteAll.isPending} onClick={handleDeleteAll}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Delete All
            </Button>
          )}
          <Button onClick={openAdd} className="bg-[#16a34a] hover:bg-[#15803d] text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["ALL", ...ALL_STATUSES] as FilterStatus[]).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"}`}>
              {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        {clients.length > 0 && (
          <Select value={filterClientId || "all"} onValueChange={(v) => setFilterClientId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-xs bg-zinc-800 border-zinc-700 text-zinc-300">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-zinc-300 text-xs">All Clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id} className="text-zinc-100 text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input placeholder="Search part number, S/N, LOT..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-8 text-sm bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
        </div>
      </div>

      {/* Table */}
      <div className={`rounded-lg border border-zinc-800 overflow-x-auto transition-opacity ${isFetching ? "opacity-70" : "opacity-100"}`}>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 w-12">#</TableHead>
              <TableHead className="text-zinc-500">Part Number</TableHead>
              <TableHead className="text-zinc-500">Serial Number</TableHead>
              <TableHead className="text-zinc-500">LOT #</TableHead>
              <TableHead className="text-zinc-500">Box</TableHead>
              <TableHead className="text-zinc-500">Issue</TableHead>
              <TableHead className="text-zinc-500">Location</TableHead>
              <TableHead className="text-zinc-500">Client</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-zinc-500">Date Added</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-12">Loading...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-12">
                {total === 0 && !debouncedSearch && filterStatus === "ALL" && !filterClientId ? "No items yet. Import a LOT from the Lots page or add items manually." : "No items match your filter."}
              </TableCell></TableRow>
            ) : items.map((item, i) => (
              <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/50">
                <TableCell className="text-zinc-500 text-sm">{page * pageSize + i + 1}</TableCell>
                <TableCell className="text-zinc-100 text-sm font-medium">{item.part_number}</TableCell>
                <TableCell className="text-zinc-400 text-sm font-mono">{item.serial_number}</TableCell>
                <TableCell className="text-zinc-400 text-sm font-mono">{item.lot_number ?? <span className="text-zinc-600">—</span>}</TableCell>
                <TableCell className="text-zinc-400 text-xs font-mono">{item.box_label ?? <span className="text-zinc-600">—</span>}</TableCell>
                <TableCell className="text-xs">
                  {item.issue
                    ? <span className="text-red-400 font-medium">{item.issue}</span>
                    : <span className="text-green-400">OK</span>}
                </TableCell>
                <TableCell>{item.location ? <Badge className={LOCATION_CONFIG[item.location].className}>{LOCATION_CONFIG[item.location].label}</Badge> : <span className="text-zinc-600">—</span>}</TableCell>
                <TableCell className="text-zinc-400 text-sm">{item.clients?.name ?? <span className="text-zinc-600">—</span>}</TableCell>
                <TableCell>{(() => { const s = STATUS_CONFIG[item.status] ?? { label: item.status, className: "bg-zinc-700 text-zinc-400 border-0" }; return <Badge className={s.className}>{s.label}</Badge>; })()}</TableCell>
                <TableCell className="text-zinc-400 text-sm">{formatDate(item.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(item)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(item)} className="p-1 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-zinc-500 text-xs">Showing {fmt(rangeStart)}–{fmt(rangeEnd)} of {fmt(total)} items</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 text-xs">Per page:</span>
              <div className="flex gap-1">
                {PAGE_SIZES.map((ps) => (
                  <button key={ps} onClick={() => setPageSize(ps)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${pageSize === ps ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"}`}>
                    {ps}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-zinc-400 text-xs px-2 min-w-[90px] text-center">Page {page + 1} / {fmt(totalPages)}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Item" : "Add Manufactured Item"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Part Number</Label>
              <Input placeholder="e.g. GBXIVO-IMB_MB1-13-CM" value={form.part_number} onChange={(e) => setForm((f) => ({ ...f, part_number: e.target.value }))} required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Serial Number</Label>
              <Input placeholder="e.g. 25050001" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono" />
            </div>
            {clients.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Client</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue placeholder="Select client..." /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="none" className="text-zinc-400">No client</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id} className="text-zinc-100">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">LOT #</Label>
                <Input placeholder="e.g. LOT1" value={form.lot_number} onChange={(e) => setForm((f) => ({ ...f, lot_number: e.target.value }))} required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ManufacturedItemStatus }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-zinc-100">{STATUS_CONFIG[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Location</Label>
              <Select value={form.location} onValueChange={(v) => setForm((f) => ({ ...f, location: v as ManufacturedItemLocation }))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {ALL_LOCATIONS.map((l) => <SelectItem key={l} value={l} className="text-zinc-100">{LOCATION_CONFIG[l].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-white">{editing ? "Save Changes" : "Add Item"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
