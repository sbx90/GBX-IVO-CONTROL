"use client";

import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle,
  ArrowUp, ArrowDown, ArrowUpDown, Ticket as TicketIcon,
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
  useDistinctManufacturedLotNumbers,
  useCreateManufacturedItem,
  useUpdateManufacturedItem,
  useDeleteManufacturedItem,
  useDeleteAllManufacturedItems,
} from "@/hooks/use-manufactured";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { useProductDimensions } from "@/hooks/use-product-dimensions";
import { useClients } from "@/hooks/use-clients";
import { useColumnResize } from "@/hooks/use-column-resize";
import { useColumnOrder } from "@/hooks/use-column-order";
import { useCreateTicket } from "@/hooks/use-tickets";
import { ISSUE_CATEGORY_CONFIG, PRIORITY_CONFIG } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { ManufacturedItem, ManufacturedItemStatus, ManufacturedItemLocation, IssueCategory, TicketPriority } from "@/lib/types/database";
import { Textarea } from "@/components/ui/textarea";

// ─── Constants ─────────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200];

const STATUS_CONFIG: Record<ManufacturedItemStatus, { label: string; className: string }> = {
  OK:         { label: "OK",           className: "bg-teal-500/15 text-teal-400 border-0" },
  IN_PROCESS: { label: "In Process",  className: "bg-yellow-500/15 text-yellow-400 border-0" },
  IN_TRANSIT: { label: "In Transit",  className: "bg-sky-500/15 text-sky-400 border-0" },
  AT_CLIENT:  { label: "@Client",     className: "bg-green-500/15 text-green-400 border-0" },
  RETURNED:   { label: "Returned",    className: "bg-amber-400/15 text-amber-400 border-0" },
  BAD:        { label: "Bad",         className: "bg-red-500/15 text-red-400 border-0" },
  MANUAL:     { label: "Manual",      className: "bg-purple-500/15 text-purple-400 border-0" },
  EXTRA:      { label: "Extra Unit",  className: "bg-orange-500/15 text-orange-400 border-0" },
};

const ALL_STATUSES: ManufacturedItemStatus[] = ["IN_PROCESS", "IN_TRANSIT", "AT_CLIENT", "RETURNED", "MANUAL", "EXTRA"];
type FilterStatus = ManufacturedItemStatus | "ALL" | "ISSUES";

const ALL_LOCATIONS: ManufacturedItemLocation[] = ["SUPPLIER", "GBX", "CLIENT"];

const LOCATION_CONFIG: Record<ManufacturedItemLocation, { label: string; className: string }> = {
  SUPPLIER: { label: "Supplier", className: "bg-zinc-700 text-zinc-400 border-0" },
  GBX:      { label: "GBX",      className: "bg-green-500/15 text-green-400 border-0" },
  CLIENT:   { label: "Client",   className: "bg-blue-500/15 text-blue-400 border-0" },
};

const COLUMNS: { key: string; label: string; sortCol: string | null }[] = [
  { key: "Part Number",   label: "Part Number",   sortCol: "part_number" },
  { key: "Serial Number", label: "Serial Number", sortCol: "serial_number" },
  { key: "LOT #",         label: "LOT #",         sortCol: "lot_number" },
  { key: "Box",           label: "Box",           sortCol: "box_label" },
  { key: "Issue",         label: "Issue",         sortCol: "issue" },
  { key: "Ticket",        label: "Ticket",        sortCol: null },
  { key: "Location",      label: "Location",      sortCol: "location" },
  { key: "Client",        label: "Client",        sortCol: null },
  { key: "Status",        label: "Status",        sortCol: "status" },
  { key: "Date Added",    label: "Date Added",    sortCol: "created_at" },
];
const DEFAULT_COL_ORDER = COLUMNS.map((c) => c.key);

interface ItemFormState {
  part_number: string;
  serial_number: string;
  lot_number: string;
  status: ManufacturedItemStatus;
  client_id: string;
  location: ManufacturedItemLocation;
  box_label: string;
}

const EMPTY_FORM: ItemFormState = {
  part_number: "",
  serial_number: "",
  lot_number: "",
  status: "OK",
  client_id: "none",
  location: "GBX",
  box_label: "",
};

function fmt(n: number) { return n.toLocaleString(); }

// ─── Page ──────────────────────────────────────────────────────────

export default function ManufacturedPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [filterPartNumbers, setFilterPartNumbers] = useState<Set<string>>(new Set());
  const [filterLotNumbers, setFilterLotNumbers] = useState<Set<string>>(new Set());
  const [filterHasTicket, setFilterHasTicket] = useState(false);
  const [filterNoIssue, setFilterNoIssue] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: catalog = [] } = useProductCatalog();
  const allPartNumbers = catalog.map(p => p.part_number);
  const { data: allLotNumbers = [] } = useDistinctManufacturedLotNumbers();

  function togglePartNumber(pn: string) {
    setFilterPartNumbers(prev => {
      const next = new Set(prev);
      next.has(pn) ? next.delete(pn) : next.add(pn);
      return next;
    });
  }

  function toggleLotNumber(ln: string) {
    setFilterLotNumbers(prev => {
      const next = new Set(prev);
      next.has(ln) ? next.delete(ln) : next.add(ln);
      return next;
    });
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => { setPage(0); }, [filterStatus, filterPartNumbers, filterLotNumbers, filterHasTicket, filterNoIssue, debouncedSearch, filterClientId, pageSize, sortCol, sortDir]);

  const { data: pageData, isLoading, isFetching } = useManufacturedItemsPaginated({
    page, pageSize,
    status: filterStatus === "ISSUES" ? "ALL" : filterStatus,
    search: debouncedSearch,
    clientId: filterClientId,
    hasIssue: filterStatus === "ISSUES",
    hasNoIssue: filterNoIssue,
    hasTicket: filterHasTicket,
    partNumbers: filterPartNumbers.size > 0 ? [...filterPartNumbers] : undefined,
    lotNumbers: filterLotNumbers.size > 0 ? [...filterLotNumbers] : undefined,
    sortCol, sortDir,
  });

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-[#16a34a]" />
      : <ArrowDown className="h-3 w-3 ml-1 text-[#16a34a]" />;
  }
  const { data: clients = [] } = useClients();
  const { data: dimensions = [] } = useProductDimensions();

  const { order, dragging, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave } =
    useColumnOrder("col-order:manufactured", DEFAULT_COL_ORDER);

  const { widths, onResizeStart } = useColumnResize("col-widths:manufactured", {
    "#": 40,
    "Part Number": 200,
    "Serial Number": 130,
    "LOT #": 90,
    "Box": 80,
    "Issue": 100,
    "Ticket": 80,
    "Location": 90,
    "Client": 100,
    "Status": 100,
    "Date Added": 110,
    "actions": 56,
  });

  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  const createItem = useCreateManufacturedItem();
  const updateItem = useUpdateManufacturedItem();
  const deleteItem = useDeleteManufacturedItem();
  const deleteAll = useDeleteAllManufacturedItems();
  const createTicket = useCreateTicket();

  // Ticket dialog state
  const [ticketItem, setTicketItem] = useState<ManufacturedItem | null>(null);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketCategory, setTicketCategory] = useState<IssueCategory>("OTHER");
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>("MEDIUM");
  const [ticketDescription, setTicketDescription] = useState("");

  function openTicketDialog(item: ManufacturedItem) {
    setTicketItem(item);
    setTicketTitle("");
    setTicketCategory("OTHER");
    setTicketPriority("MEDIUM");
    setTicketDescription("");
  }

  async function handleTicketSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketItem) return;
    await createTicket.mutateAsync({
      manufactured_item_id: ticketItem.id,
      client_id: ticketItem.client_id ?? undefined,
      title: ticketTitle.trim(),
      issue_category: ticketCategory,
      priority: ticketPriority,
      description: ticketDescription.trim() || undefined,
    });
    setTicketItem(null);
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManufacturedItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(item: ManufacturedItem) {
    setEditing(item);
    setForm({ part_number: item.part_number, serial_number: item.serial_number, lot_number: item.lot_number ?? "", status: item.status, client_id: item.client_id ?? "none", location: item.location ?? "GBX", box_label: item.box_label ?? "" });
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
      box_label: form.box_label.trim() || null,
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
          <p className="mt-1 flex items-center gap-1.5">
            <span
              key={total}
              className="text-xl font-bold text-zinc-100 tabular-nums"
              style={{ animation: "pulse-pop 0.4s ease-out" }}
            >
              {fmt(total)}
            </span>
            {isFetching && <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" style={{ animation: "blink 1s step-start infinite" }} />}
          </p>
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

      {/* LOT# chips */}
      {allLotNumbers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setFilterLotNumbers(new Set())}
            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
              filterLotNumbers.size === 0
                ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
            }`}
          >
            All
          </button>
          {allLotNumbers.map((ln) => {
            const active = filterLotNumbers.has(ln);
            return (
              <button
                key={ln}
                onClick={() => toggleLotNumber(ln)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium border transition-colors ${
                  active
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {ln}
              </button>
            );
          })}
        </div>
      )}

      {/* Part number chips */}
      {allPartNumbers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setFilterPartNumbers(new Set())}
            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
              filterPartNumbers.size === 0
                ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
            }`}
          >
            All
          </button>
          {allPartNumbers.map((pn) => {
            const active = filterPartNumbers.has(pn);
            return (
              <button
                key={pn}
                onClick={() => togglePartNumber(pn)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium border transition-colors ${
                  active
                    ? "bg-[#7c6aff]/20 border-[#7c6aff]/60 text-[#a99fff]"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {pn}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["ALL", ...ALL_STATUSES, "ISSUES"] as FilterStatus[]).map((s) => (
            <button key={s} onClick={() => { setFilterStatus(s); if (s === "ISSUES") setFilterNoIssue(false); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                s === "ISSUES"
                  ? filterStatus === s ? "bg-red-500/20 text-red-400" : "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                  : filterStatus === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}>
              {s === "ALL" ? "All" : s === "ISSUES" ? "Issues" : STATUS_CONFIG[s as ManufacturedItemStatus].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setFilterNoIssue(v => !v); if (filterStatus === "ISSUES") setFilterStatus("ALL"); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            filterNoIssue ? "bg-teal-500/20 text-teal-400" : "text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10"
          }`}
        >
          No Issue
        </button>
        <button
          onClick={() => setFilterHasTicket(v => !v)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            filterHasTicket ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10"
          }`}
        >
          <TicketIcon className="h-3 w-3" />
          Has Ticket
        </button>
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
        <Table style={{ tableLayout: "fixed", minWidth: Object.values(widths).reduce((a, b) => a + b, 0) + widths["#"] + widths["actions"] }}>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent bg-zinc-900">
              {/* Fixed: index */}
              <TableHead className="text-zinc-500 relative overflow-hidden bg-zinc-900 sticky top-0 z-10" style={{ width: widths["#"], minWidth: widths["#"] }}>
                <span className="text-xs">#</span>
                <div onMouseDown={(e) => onResizeStart("#", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-600 active:bg-[#16a34a] transition-colors" />
              </TableHead>
              {/* Draggable + resizable columns in order */}
              {order.map((key) => {
                const colDef = COLUMNS.find((c) => c.key === key)!;
                const isDragging = dragging === key;
                const isOver = dragOver === key;
                return (
                  <TableHead
                    key={key}
                    draggable
                    onDragStart={() => onDragStart(key)}
                    onDragOver={(e) => onDragOver(key, e)}
                    onDrop={() => onDrop(key)}
                    onDragEnd={onDragEnd}
                    onDragLeave={() => onDragLeave(key)}
                    className="text-zinc-500 relative overflow-hidden select-none bg-zinc-900 sticky top-0 z-10"
                    style={{
                      width: widths[key],
                      minWidth: widths[key],
                      opacity: isDragging ? 0.35 : 1,
                      borderLeft: isOver ? "2px solid #16a34a" : undefined,
                      cursor: "grab",
                    }}
                  >
                    {colDef.sortCol ? (
                      <button
                        onClick={() => handleSort(colDef.sortCol!)}
                        className="flex items-center hover:text-zinc-200 transition-colors truncate w-full"
                        style={{ cursor: "inherit" }}
                      >
                        <span className="truncate">{colDef.label}</span>
                        <SortIcon col={colDef.sortCol} />
                      </button>
                    ) : (
                      <span className="truncate">{colDef.label}</span>
                    )}
                    <div
                      draggable={false}
                      onMouseDown={(e) => onResizeStart(key, e)}
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-600 active:bg-[#16a34a] transition-colors"
                    />
                  </TableHead>
                );
              })}
              {/* Fixed: actions */}
              <TableHead className="bg-zinc-900 sticky top-0 z-10" style={{ width: widths["actions"], minWidth: widths["actions"] }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={order.length + 2} className="text-center text-zinc-500 py-12">Loading...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={order.length + 2} className="text-center text-zinc-500 py-12">
                {total === 0 && !debouncedSearch && filterStatus === "ALL" && !filterClientId ? "No items yet. Import a LOT from the Lots page or add items manually." : "No items match your filter."}
              </TableCell></TableRow>
            ) : items.map((item, i) => (
              <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/50">
                <TableCell className="text-zinc-500 text-sm">{page * pageSize + i + 1}</TableCell>
                {order.map((key) => {
                  switch (key) {
                    case "Part Number":
                      return <TableCell key={key} className="text-zinc-100 text-sm font-medium truncate">{item.part_number}</TableCell>;
                    case "Serial Number":
                      return <TableCell key={key} className="text-zinc-400 text-sm font-mono truncate">{item.serial_number}</TableCell>;
                    case "LOT #":
                      return <TableCell key={key} className="text-zinc-400 text-sm font-mono">{item.lot_number ?? <span className="text-zinc-600">—</span>}</TableCell>;
                    case "Box":
                      return <TableCell key={key} className="text-zinc-400 text-xs font-mono">{item.box_label ? item.box_label.replace(/^LOT#\d+\s*/i, "") : <span className="text-zinc-600">—</span>}</TableCell>;
                    case "Issue":
                      return <TableCell key={key} className="text-xs">{item.issue ? <span className="text-red-400 font-medium">{item.issue}</span> : <span className="text-green-400">OK</span>}</TableCell>;
                    case "Ticket": {
                      const count = item.tickets?.[0]?.count ?? 0;
                      return (
                        <TableCell key={key} className="text-xs">
                          {count > 0
                            ? <span className="text-blue-400 font-medium">{count} ticket{count !== 1 ? "s" : ""}</span>
                            : <button onClick={() => openTicketDialog(item)} className="p-0.5 text-zinc-600 hover:text-blue-400 transition-colors" title="Create ticket"><TicketIcon className="h-3.5 w-3.5" /></button>}
                        </TableCell>
                      );
                    }
                    case "Location":
                      return <TableCell key={key}>{item.location ? <Badge className={LOCATION_CONFIG[item.location].className}>{LOCATION_CONFIG[item.location].label}</Badge> : <span className="text-zinc-600">—</span>}</TableCell>;
                    case "Client":
                      return <TableCell key={key} className="text-zinc-400 text-sm truncate">{item.clients?.name ?? <span className="text-zinc-600">—</span>}</TableCell>;
                    case "Status": {
                      const s = STATUS_CONFIG[item.status] ?? { label: item.status, className: "bg-zinc-700 text-zinc-400 border-0" };
                      return <TableCell key={key}><Badge className={s.className}>{s.label}</Badge></TableCell>;
                    }
                    case "Date Added":
                      return <TableCell key={key} className="text-zinc-400 text-sm">{formatDateTime(item.created_at)}</TableCell>;
                    default:
                      return <TableCell key={key} />;
                  }
                })}
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

      {/* Create Ticket Dialog */}
      <Dialog open={!!ticketItem} onOpenChange={(o) => { if (!o) setTicketItem(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">New Ticket</DialogTitle>
            {ticketItem && (
              <p className="text-zinc-500 text-sm font-mono">
                {ticketItem.part_number} · S/N {ticketItem.serial_number}
              </p>
            )}
          </DialogHeader>
          <form onSubmit={handleTicketSubmit} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Title</Label>
              <Input
                placeholder="Describe the issue…"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Category</Label>
                <Select value={ticketCategory} onValueChange={(v) => setTicketCategory(v as IssueCategory)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {(Object.keys(ISSUE_CATEGORY_CONFIG) as IssueCategory[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-zinc-100">{ISSUE_CATEGORY_CONFIG[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Priority</Label>
                <Select value={ticketPriority} onValueChange={(v) => setTicketPriority(v as TicketPriority)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {(Object.keys(PRIORITY_CONFIG) as TicketPriority[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-zinc-100">{PRIORITY_CONFIG[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Description <span className="text-zinc-600 normal-case">(optional)</span></Label>
              <Textarea
                placeholder="Additional details…"
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                rows={3}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTicketItem(null)} className="text-zinc-400">Cancel</Button>
              <Button type="submit" size="sm" disabled={createTicket.isPending || !ticketTitle.trim()} className="bg-blue-600 hover:bg-blue-500 text-white">
                Create Ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">{editing ? "Edit Item" : "Add Manufactured Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-1">

            {/* Identity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Part Number</Label>
                <Input placeholder="e.g. GBXIVO-IMB_MB1-13-CM" value={form.part_number} onChange={(e) => setForm((f) => ({ ...f, part_number: e.target.value }))} required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Serial Number</Label>
                <Input placeholder="e.g. 25050001" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono text-sm" />
              </div>
            </div>

            {/* Box label */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Box</Label>
              <Input placeholder="e.g. LOT#1 12/52" value={form.box_label ?? ""} onChange={(e) => setForm((f) => ({ ...f, box_label: e.target.value }))} className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono text-sm" />
            </div>

            {/* Logistics + Client */}
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">LOT #</Label>
                <Select value={form.lot_number || "none"} onValueChange={(v) => setForm((f) => ({ ...f, lot_number: v === "none" ? "" : v }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm font-mono"><SelectValue placeholder="Select LOT…" /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="none" className="text-zinc-400">No LOT</SelectItem>
                    {allLotNumbers.map((ln) => <SelectItem key={ln} value={ln} className="text-zinc-100 font-mono">{ln}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ManufacturedItemStatus }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-zinc-100">{STATUS_CONFIG[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Location</Label>
                <Select value={form.location} onValueChange={(v) => setForm((f) => ({ ...f, location: v as ManufacturedItemLocation }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {ALL_LOCATIONS.map((l) => <SelectItem key={l} value={l} className="text-zinc-100">{LOCATION_CONFIG[l].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {clients.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"><SelectValue placeholder="Client…" /></SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="none" className="text-zinc-400">No client</SelectItem>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id} className="text-zinc-100">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Product dimensions */}
            {(() => {
              const dim = dimensions.find(d => d.part_number.replace(/-/g,"_").toUpperCase() === form.part_number.replace(/-/g,"_").toUpperCase());
              if (!dim) return null;
              const fields = [
                { label: "Size (cm)", value: dim.size_cm ?? null },
                { label: "Volume (m³)", value: dim.volume_m3 != null ? String(dim.volume_m3) : null },
                { label: "Weight (kg)", value: dim.weight_kg != null ? String(dim.weight_kg) : null },
                { label: "Boxes", value: dim.boxes_qty != null ? String(dim.boxes_qty) : null },
                { label: "Qty/Box", value: dim.qty_per_box != null ? String(dim.qty_per_box) : null },
              ].filter(f => f.value !== null);
              if (fields.length === 0) return null;
              return (
                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-2.5">
                  <p className="text-sm text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Product Dimensions</p>
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3">
                    {fields.map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] text-zinc-600 mb-0">{f.label}</p>
                        <p className="text-xl text-zinc-200 font-medium leading-tight">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
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
