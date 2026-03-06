"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
const CameraScanner = dynamic(
  () => import("@/components/stock/camera-scanner").then(m => m.CameraScanner),
  { ssr: false }
);
import {
  Search, ChevronLeft, ChevronRight, CheckCircle2, ScanLine, X,
  ArrowUp, ArrowDown, ArrowUpDown, Ticket as TicketIcon, Camera, ImagePlus, Pencil,
  AlertCircle, ArrowLeftRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useManufacturedItemsPaginated,
  useGBXWarehouseStock,
  useVerifyStockItems,
  useUnverifyStockItem,
  useUpdateManufacturedItem,
  useUploadItemImage,
  useRemoveItemImage,
  useLookupItemBySerial,
  useOwedItems,
  useAvailableReplacements,
  useReplaceOwedItem,
} from "@/hooks/use-manufactured";
import { useClients } from "@/hooks/use-clients";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { useIssueDefinitions } from "@/hooks/use-issue-definitions";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import type { ManufacturedItem, ManufacturedItemStatus, ManufacturedItemLocation } from "@/lib/types/database";

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200];

const STATUS_CONFIG: Record<ManufacturedItemStatus, { label: string; className: string }> = {
  OK:         { label: "OK",          className: "bg-teal-500/15 text-teal-400 border-0" },
  IN_PROCESS: { label: "In Process",  className: "bg-yellow-500/15 text-yellow-400 border-0" },
  IN_TRANSIT: { label: "In Transit",  className: "bg-sky-500/15 text-sky-400 border-0" },
  AT_CLIENT:  { label: "@Client",     className: "bg-green-500/15 text-green-400 border-0" },
  RETURNED:   { label: "Returned",    className: "bg-amber-400/15 text-amber-400 border-0" },
  BAD:        { label: "Bad",         className: "bg-red-500/15 text-red-400 border-0" },
  MANUAL:     { label: "Manual",      className: "bg-purple-500/15 text-purple-400 border-0" },
  EXTRA:      { label: "Extra Unit",  className: "bg-orange-500/15 text-orange-400 border-0" },
  OWE:        { label: "Owed",        className: "bg-rose-500/15 text-rose-400 border-0" },
};

const LOCATION_CONFIG: Record<string, { label: string; className: string }> = {
  FACTORY:           { label: "Factory",          className: "bg-amber-500/15 text-amber-400" },
  TRANSIT:           { label: "Transit",           className: "bg-sky-500/15 text-sky-400" },
  GBX_WAREHOUSE_CHINA: { label: "GBX WH China",   className: "bg-violet-500/15 text-violet-400" },
  GBX_WAREHOUSE:     { label: "GBX Warehouse",     className: "bg-indigo-500/15 text-indigo-400" },
  FREIGHT_FORWARDER: { label: "Freight-Forwarder", className: "bg-cyan-500/15 text-cyan-400" },
  CLIENT_WAREHOUSE:  { label: "Client WH",         className: "bg-green-500/15 text-green-400" },
  GBX:               { label: "GBX",               className: "bg-violet-500/15 text-violet-400" },
  SUPPLIER:          { label: "Supplier",           className: "bg-zinc-700 text-zinc-300" },
  CLIENT:            { label: "Client",             className: "bg-green-500/15 text-green-400" },
};

type VerifyFilter = "ALL" | "VERIFIED" | "UNVERIFIED";

function fmt(n: number) { return n.toLocaleString(); }

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 ml-1 text-zinc-600 inline" />;
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3 ml-1 text-[#16a34a] inline" />
    : <ArrowDown className="h-3 w-3 ml-1 text-[#16a34a] inline" />;
}

// ─── Replace Owed Dialog ──────────────────────────────────────────────────────

function ReplaceOwedDialog({
  item,
  gbxClientId,
  replaceOwedItem,
  onClose,
}: {
  item: ManufacturedItem;
  gbxClientId: string | null;
  replaceOwedItem: ReturnType<typeof useReplaceOwedItem>;
  onClose: () => void;
}) {
  const { data: replacements = [], isLoading } = useAvailableReplacements(item.part_number, gbxClientId);
  const [selectedId, setSelectedId] = useState<string>("");

  async function handleConfirm() {
    const rep = replacements.find(r => r.id === selectedId);
    if (!rep) return;
    await replaceOwedItem.mutateAsync({ owedItem: item, replacementId: rep.id, replacementSerial: rep.serial_number });
    onClose();
  }

  const clientName = (item as ManufacturedItem & { clients?: { name: string } | null }).clients?.name ?? "Unknown client";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-zinc-400" />
            Replace Owed Unit
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-zinc-500 mb-1">Owed unit</p>
            <p className="text-sm font-mono text-zinc-200">{item.serial_number} <span className="text-zinc-500 text-xs">{item.part_number}</span></p>
            <p className="text-xs text-rose-400 mt-0.5">→ {clientName}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Select Replacement (OK, GBX stock)</Label>
            {isLoading ? (
              <p className="text-zinc-500 text-sm py-3 text-center">Loading available units…</p>
            ) : replacements.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">
                No OK units of <span className="font-mono text-zinc-300">{item.part_number}</span> available in GBX stock.
              </p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {replacements.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
                      selectedId === r.id
                        ? "bg-green-500/10 border-green-500/40 text-green-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <span className="font-mono">{r.serial_number}</span>
                    {r.lot_number && <span className="text-zinc-500 text-xs">{r.lot_number}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId || replaceOwedItem.isPending}
              className="flex-1 px-4 py-2 rounded-md bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {replaceOwedItem.isPending ? "Replacing…" : "Confirm Replacement"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { data: clients = [] } = useClients();
  const gbxClient = clients.find(c => c.name.toLowerCase() === "gbx");
  const gbxClientId = gbxClient?.id ?? null;

  // Filters
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLotNumbers, setFilterLotNumbers] = useState<Set<string>>(new Set());
  const [filterPartNumbers, setFilterPartNumbers] = useState<Set<string>>(new Set());
  const [verifyFilter, setVerifyFilter] = useState<VerifyFilter>("ALL");
  const [filterHasIssue, setFilterHasIssue] = useState(false);
  const [filterNoIssue, setFilterNoIssue] = useState(false);
  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Scan state
  const [scanInput, setScanInput] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [filterLotNumbers, filterPartNumbers, verifyFilter, filterHasIssue, filterNoIssue, debouncedSearch, pageSize, sortCol, sortDir]);

  const { data: catalog = [] } = useProductCatalog();
  const allPartNumbers = catalog.map(p => p.part_number);

  // All GBX items for verification summary
  const { data: allGBXItems = [] } = useGBXWarehouseStock(gbxClientId);
  const totalVerified = allGBXItems.filter(i => i.stock_verified_at).length;
  const totalUnverified = allGBXItems.length - totalVerified;

  const gbxLotNumbers = useMemo(() => {
    const seen = new Set<string>();
    allGBXItems.forEach(i => { if (i.lot_number) seen.add(i.lot_number); });
    return [...seen].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [allGBXItems]);

  // Paginated list (reuses the same hook as manufactured page, locked to GBX client)
  const { data: pageData, isLoading, isFetching } = useManufacturedItemsPaginated({
    page,
    pageSize,
    status: "ALL",
    search: debouncedSearch,
    clientId: gbxClientId ?? "",
    hasIssue: filterHasIssue,
    hasNoIssue: filterNoIssue,
    partNumbers: filterPartNumbers.size > 0 ? [...filterPartNumbers] : undefined,
    lotNumbers: filterLotNumbers.size > 0 ? [...filterLotNumbers] : undefined,
    sortCol,
    sortDir,
  });

  const verifyItems = useVerifyStockItems();
  const unverifyItem = useUnverifyStockItem();
  const updateItem = useUpdateManufacturedItem();
  const uploadItemImage = useUploadItemImage();
  const removeItemImage = useRemoveItemImage();
  const lookupItemBySerial = useLookupItemBySerial();
  const replaceOwedItem = useReplaceOwedItem();
  const { data: issueDefinitions = [] } = useIssueDefinitions();
  const { data: owedItems = [] } = useOwedItems();

  // Owed Units dialog
  const [owedDialogOpen, setOwedDialogOpen] = useState(false);
  const [replacingItem, setReplacingItem] = useState<ManufacturedItem | null>(null);

  // OWE prompt (after scanning a non-GBX item)
  type OwedPromptItem = { id: string; serial_number: string; part_number: string; client_id: string | null; clientName: string };
  const [owePrompt, setOwePrompt] = useState<OwedPromptItem | null>(null);
  const [oweConfirmed, setOweConfirmed] = useState(true);

  // Post-verify issue prompt
  type VerifiedItem = { id: string; serial_number: string; part_number: string; issue: string | null };
  const [issuePrompt, setIssuePrompt] = useState<VerifiedItem | null>(null);
  const [issuePromptValue, setIssuePromptValue] = useState("none");
  const [issuePromptComment, setIssuePromptComment] = useState("");
  const [issuePromptFile, setIssuePromptFile] = useState<File | null>(null);
  const [issuePromptPreview, setIssuePromptPreview] = useState<string | null>(null);
  const issuePromptFileRef = useRef<HTMLInputElement>(null);

  function clearIssuePrompt() {
    setIssuePrompt(null);
    setIssuePromptValue("none");
    setIssuePromptComment("");
    setIssuePromptFile(null);
    setIssuePromptPreview(null);
  }

  function handleIssuePromptImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIssuePromptFile(file);
    setIssuePromptPreview(URL.createObjectURL(file));
  }

  async function handleIssuePromptSave() {
    if (!issuePrompt) return;
    const issue = issuePromptValue === "none" ? null : (issueDefinitions.find(d => d.id === issuePromptValue)?.name ?? null);
    const comment = issuePromptComment.trim() || null;
    const itemId = issuePrompt.id;
    clearIssuePrompt();
    await updateItem.mutateAsync({ id: itemId, updates: { issue, comment } });
    if (issuePromptFile) await uploadItemImage.mutateAsync({ itemId, file: issuePromptFile });
  }

  async function handleOweSave() {
    if (!owePrompt) return;
    if (oweConfirmed) {
      await updateItem.mutateAsync({ id: owePrompt.id, updates: { status: "OWE" } });
      toast.success(`${owePrompt.serial_number} marked as Owed to ${owePrompt.clientName}`);
    }
    setOwePrompt(null);
  }

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Edit dialog
  const [editItem, setEditItem] = useState<ManufacturedItem | null>(null);
  const [editIssue, setEditIssue] = useState("none");
  const [editComment, setEditComment] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editPendingFile, setEditPendingFile] = useState<File | null>(null);
  const [editPendingPreview, setEditPendingPreview] = useState<string | null>(null);

  function openEditDialog(item: ManufacturedItem) {
    setEditItem(item);
    setEditIssue(issueDefinitions.find(d => d.name === item.issue)?.id ?? "none");
    setEditComment(item.comment ?? "");
    setEditImageUrl(item.image_url ?? null);
    setEditPendingFile(null);
    setEditPendingPreview(null);
  }

  async function handleEditSave() {
    if (!editItem) return;
    const issue = editIssue === "none" ? null : (issueDefinitions.find(d => d.id === editIssue)?.name ?? null);
    const comment = editComment.trim() || null;
    await updateItem.mutateAsync({ id: editItem.id, updates: { issue, comment } });
    if (editPendingFile) {
      await uploadItemImage.mutateAsync({ itemId: editItem.id, file: editPendingFile });
    }
    setEditItem(null);
  }

  async function handleEditRemoveImage() {
    if (!editItem || !editImageUrl) return;
    await removeItemImage.mutateAsync({ itemId: editItem.id, imageUrl: editImageUrl });
    setEditImageUrl(null);
  }

  // Inline comment editing
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState("");

  function startEditComment(id: string, current: string | null) {
    setEditingCommentId(id);
    setEditingCommentValue(current ?? "");
  }

  async function saveComment(id: string) {
    const value = editingCommentValue.trim() || null;
    setEditingCommentId(null);
    await updateItem.mutateAsync({ id, updates: { comment: value } });
  }

  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  // Apply verifyFilter client-side on current page items
  const filteredItems = useMemo(() => {
    if (verifyFilter === "VERIFIED") return items.filter(i => i.stock_verified_at);
    if (verifyFilter === "UNVERIFIED") return items.filter(i => !i.stock_verified_at);
    return items;
  }, [items, verifyFilter]);

  function toggleLotNumber(ln: string) {
    setFilterLotNumbers(prev => {
      const next = new Set(prev);
      next.has(ln) ? next.delete(ln) : next.add(ln);
      return next;
    });
  }

  function togglePartNumber(pn: string) {
    setFilterPartNumbers(prev => {
      const next = new Set(prev);
      next.has(pn) ? next.delete(pn) : next.add(pn);
      return next;
    });
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  async function getVerifiedBy() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? "unknown";
  }

  function parseBarcodeSerial(raw: string): string {
    // Handle format: "GBXIVO-IMB_CAM-A1 S/N:25090451"
    const snMatch = raw.match(/S\/N[:\s]+(\S+)/i);
    if (snMatch) return snMatch[1].trim();
    // Fallback: use raw value as-is
    return raw.trim();
  }

  async function handleCameraScan(raw: string) {
    if (!gbxClientId) return;
    setCameraOpen(false);
    const serial = parseBarcodeSerial(raw);
    const verifiedBy = await getVerifiedBy();
    const result = await verifyItems.mutateAsync({ serials: [serial], verifiedBy, clientId: gbxClientId });
    if (result.matched > 0) {
      const item = result.matchedItems[0];
      clearIssuePrompt();
      setIssuePromptValue(issueDefinitions.find(d => d.name === item.issue)?.id ?? "none");
      setIssuePrompt(item);
    } else if (result.notFound.length > 0) {
      const found = await lookupItemBySerial.mutateAsync({ serial, verifiedBy });
      if (found && found.client_id && found.client_id !== gbxClientId) {
        const clientName = clients.find(c => c.id === found.client_id)?.name ?? "Unknown";
        setOwePrompt({ id: found.id, serial_number: found.serial_number, part_number: found.part_number, client_id: found.client_id, clientName });
      } else {
        toast.error(`Serial not found: ${serial}`);
      }
    } else {
      toast.error(`Serial not found: ${serial}`);
    }
  }

  async function handleSingleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !gbxClientId) return;
    const serial = scanInput.trim();
    if (!serial) return;
    setScanInput("");
    const verifiedBy = await getVerifiedBy();
    const result = await verifyItems.mutateAsync({ serials: [serial], verifiedBy, clientId: gbxClientId });
    if (result.matched > 0) {
      const item = result.matchedItems[0];
      clearIssuePrompt();
      setIssuePromptValue(issueDefinitions.find(d => d.name === item.issue)?.id ?? "none");
      setIssuePrompt(item);
    } else if (result.notFound.length > 0) {
      // Not in GBX stock — check if it belongs to another client (OWE candidate)
      const found = await lookupItemBySerial.mutateAsync({ serial, verifiedBy });
      if (found && found.client_id && found.client_id !== gbxClientId) {
        const clientName = (found as ManufacturedItem & { clients?: { name: string } | null }).clients?.name ?? "Unknown Client";
        setOwePrompt({ id: found.id, serial_number: found.serial_number, part_number: found.part_number, client_id: found.client_id, clientName });
        setOweConfirmed(true);
      } else {
        toast.error(`${serial} not found in stock`);
      }
    } else {
      toast.info(`${serial} already verified`);
    }
  }

  async function handleBulkVerify() {
    if (!gbxClientId) return;
    const serials = bulkText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (serials.length === 0) return;
    const verifiedBy = await getVerifiedBy();
    const result = await verifyItems.mutateAsync({ serials, verifiedBy, clientId: gbxClientId });
    toast.success(`${result.matched} verified${result.notFound.length > 0 ? ` · ${result.notFound.length} not found` : ""}`);
    if (result.notFound.length > 0) {
      toast.warning(`Not found: ${result.notFound.slice(0, 5).join(", ")}${result.notFound.length > 5 ? ` +${result.notFound.length - 5} more` : ""}`);
    }
    setBulkText("");
    setBulkMode(false);
  }

  const allComplete = allGBXItems.length > 0 && totalVerified === allGBXItems.length;

  // No GBX client configured
  if (clients.length > 0 && !gbxClient) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">Stock</h1>
        <p className="text-zinc-500 text-sm">No client named <span className="font-mono text-zinc-300">"GBX"</span> found. Add a GBX client in Settings to use this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Stock</h1>
          <p className="mt-1 flex items-center gap-2">
            <span key={total} className="text-xl font-bold text-zinc-100 tabular-nums" style={{ animation: "pulse-pop 0.4s ease-out" }}>
              {fmt(total)}
            </span>
            {isFetching && <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" style={{ animation: "blink 1s step-start infinite" }} />}
            {allGBXItems.length > 0 && (
              <span className="text-sm text-zinc-500">
                <span className="text-green-400 font-medium">{fmt(totalVerified)}</span> verified
                {" · "}
                <span className={totalUnverified > 0 ? "text-amber-400 font-medium" : "text-zinc-600"}>{fmt(totalUnverified)}</span> unverified
                {allComplete && <span className="ml-2 text-green-400 font-semibold">✓ ALL VERIFIED</span>}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {owedItems.length > 0 && (
            <button
              onClick={() => setOwedDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition-colors text-xs font-semibold"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Owed to Clients ({owedItems.length})
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search part number, S/N, LOT..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-9 w-72 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* ── Overall progress bar ── */}
      {allGBXItems.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allComplete ? "bg-green-500" : "bg-amber-500"}`}
              style={{ width: `${(totalVerified / allGBXItems.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500 tabular-nums w-10 text-right">
            {Math.round((totalVerified / allGBXItems.length) * 100)}%
          </span>
        </div>
      )}

      {/* ── Scan Panel ── */}
      <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Scan & Verify</span>
          </div>
          <button
            onClick={() => { setBulkMode(v => !v); setBulkText(""); }}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${bulkMode ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            Bulk paste
          </button>
        </div>

        {!bulkMode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  ref={scanRef}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleSingleScan}
                  placeholder="Scan or type serial number, press Enter…"
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono bg-zinc-900 border border-zinc-700 rounded focus:outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600"
                  disabled={verifyItems.isPending || !gbxClientId}
                />
              </div>
              {scanInput && (
                <button onClick={() => setScanInput("")} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setCameraOpen(true)}
                disabled={!gbxClientId}
                title="Scan with camera"
                className="flex items-center justify-center h-9 w-9 rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            {cameraOpen && (
              <CameraScanner
                onScan={handleCameraScan}
                onClose={() => setCameraOpen(false)}
              />
            )}
            {/* Issue prompt after verify */}
            {issuePrompt && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3 space-y-2.5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-green-400 text-xs font-semibold">✓ Verified</span>
                    <span className="text-zinc-300 text-xs font-mono">{issuePrompt.serial_number}</span>
                    <span className="text-zinc-500 text-xs">{issuePrompt.part_number}</span>
                  </div>
                  <button onClick={clearIssuePrompt} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Issue */}
                <div className="flex items-center gap-2">
                  <label className="text-zinc-500 text-[11px] w-16 flex-shrink-0">Issue</label>
                  <select
                    value={issuePromptValue}
                    onChange={e => setIssuePromptValue(e.target.value)}
                    className="flex-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-zinc-500"
                    autoFocus
                  >
                    <option value="none">No Issue — OK</option>
                    {issueDefinitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {/* Comment */}
                <div className="flex items-center gap-2">
                  <label className="text-zinc-500 text-[11px] w-16 flex-shrink-0">Comment</label>
                  <input
                    value={issuePromptComment}
                    onChange={e => setIssuePromptComment(e.target.value)}
                    placeholder="Optional note…"
                    className="flex-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                </div>
                {/* Image upload */}
                <div className="flex items-center gap-2">
                  <label className="text-zinc-500 text-[11px] w-16 flex-shrink-0">Photo</label>
                  <input ref={issuePromptFileRef} type="file" accept="image/*" className="hidden" onChange={handleIssuePromptImage} />
                  {issuePromptPreview ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={issuePromptPreview} alt="" className="h-10 w-10 rounded object-cover border border-zinc-600" />
                      <button onClick={() => { setIssuePromptFile(null); setIssuePromptPreview(null); }} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => issuePromptFileRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-700 hover:border-zinc-500 rounded px-3 py-1.5 transition-colors"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Add photo (optional)
                    </button>
                  )}
                </div>
                {/* Actions */}
                <div className="flex justify-end gap-2 pt-0.5">
                  <button onClick={clearIssuePrompt} className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">Skip</button>
                  <button
                    onClick={handleIssuePromptSave}
                    disabled={updateItem.isPending || uploadItemImage.isPending}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                  >
                    {updateItem.isPending || uploadItemImage.isPending ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}
            {/* OWE prompt — non-GBX item scanned */}
            {owePrompt && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                      <span className="text-rose-400 text-xs font-semibold">Client Unit Received</span>
                    </div>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      <span className="font-mono text-zinc-300">{owePrompt.serial_number}</span>
                      {" "}<span className="text-zinc-500">{owePrompt.part_number}</span>
                      {" "}— belongs to <span className="text-zinc-200 font-medium">{owePrompt.clientName}</span>
                    </p>
                  </div>
                  <button onClick={() => setOwePrompt(null)} className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oweConfirmed}
                    onChange={e => setOweConfirmed(e.target.checked)}
                    className="accent-rose-500 h-3.5 w-3.5"
                  />
                  <span className="text-xs text-zinc-300">Mark as <span className="text-rose-400 font-semibold">OWE</span> — GBX owes a replacement to {owePrompt.clientName}</span>
                </label>
                <div className="flex justify-end gap-2 pt-0.5">
                  <button onClick={() => setOwePrompt(null)} className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">Dismiss</button>
                  <button
                    onClick={handleOweSave}
                    disabled={updateItem.isPending}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                  >
                    {updateItem.isPending ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder="Paste serial numbers (one per line or comma-separated)…"
              className="w-full text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-zinc-200 placeholder:text-zinc-600 resize-none h-24 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkVerify}
                disabled={!bulkText.trim() || verifyItems.isPending || !gbxClientId}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors"
              >
                {verifyItems.isPending ? "Verifying…" : "Match & Verify"}
              </button>
              <span className="text-xs text-zinc-600">
                {bulkText.trim() ? `${bulkText.split(/[\n,\s]+/).filter(Boolean).length} serials` : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── LOT filter chips ── */}
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
        {gbxLotNumbers.map(ln => {
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

      {/* ── Part Number filter chips ── */}
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
        {allPartNumbers.map(pn => {
          const active = filterPartNumbers.has(pn);
          return (
            <button
              key={pn}
              onClick={() => togglePartNumber(pn)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium border transition-colors ${
                active
                  ? "bg-[#16a34a]/15 border-[#16a34a]/40 text-[#16a34a]"
                  : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {pn}
            </button>
          );
        })}
      </div>

      {/* ── Verify filter + issue filter + pagination ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-1 border border-zinc-700/60">
            {(["ALL", "UNVERIFIED", "VERIFIED"] as VerifyFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setVerifyFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  verifyFilter === f ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f === "ALL" ? "All" : f === "VERIFIED" ? `Verified (${fmt(totalVerified)})` : `Unverified (${fmt(totalUnverified)})`}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setFilterHasIssue(v => !v); setFilterNoIssue(false); }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filterHasIssue ? "bg-red-500/20 text-red-400" : "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
            }`}
          >
            Issues
          </button>
          <button
            onClick={() => { setFilterNoIssue(v => !v); setFilterHasIssue(false); }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filterNoIssue ? "bg-teal-500/20 text-teal-400" : "text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10"
            }`}
          >
            No Issue
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{rangeStart}–{rangeEnd} of {fmt(total)}</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-500 w-16 text-center">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 w-10">#</TableHead>
              <TableHead className="text-zinc-500 cursor-pointer select-none" onClick={() => handleSort("part_number")}>
                Part Number <SortIcon col="part_number" active={sortCol === "part_number"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-500 cursor-pointer select-none" onClick={() => handleSort("serial_number")}>
                Serial Number <SortIcon col="serial_number" active={sortCol === "serial_number"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-500 cursor-pointer select-none" onClick={() => handleSort("lot_number")}>
                LOT # <SortIcon col="lot_number" active={sortCol === "lot_number"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-500">Box</TableHead>
              <TableHead className="text-zinc-500">Location</TableHead>
              <TableHead className="text-zinc-500 cursor-pointer select-none" onClick={() => handleSort("status")}>
                Status <SortIcon col="status" active={sortCol === "status"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-500 w-12">Image</TableHead>
              <TableHead className="text-zinc-500">Issue</TableHead>
              <TableHead className="text-zinc-500">Comment</TableHead>
              <TableHead className="text-zinc-500">Ticket</TableHead>
              <TableHead className="text-zinc-500">Verified By</TableHead>
              <TableHead className="text-zinc-500">Verified Date</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-zinc-500 py-12">Loading…</TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-zinc-500 py-12">
                  {!gbxClientId ? "Waiting for client data…" : "No items match your filter."}
                </TableCell>
              </TableRow>
            ) : filteredItems.map((item, i) => {
              const statusCfg = STATUS_CONFIG[item.status] ?? { label: item.status, className: "bg-zinc-700 text-zinc-400 border-0" };
              const locCfg = item.location ? (LOCATION_CONFIG[item.location] ?? { label: item.location, className: "bg-zinc-700 text-zinc-300" }) : null;

              return (
                <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell className="text-zinc-500 text-sm">{page * pageSize + i + 1}</TableCell>
                  <TableCell className="text-zinc-100 text-sm font-mono font-medium">{item.part_number}</TableCell>
                  <TableCell className="text-zinc-300 text-sm font-mono">{item.serial_number}</TableCell>
                  <TableCell className="text-zinc-400 text-sm font-mono">{item.lot_number ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-zinc-400 text-sm font-mono">{item.box_label ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell>
                    {locCfg
                      ? <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${locCfg.className}`}>{locCfg.label}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" onClick={() => setLightboxUrl(item.image_url)}
                        className="h-8 w-8 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity border border-zinc-700" />
                    ) : (
                      <Camera className="h-4 w-4 text-zinc-700" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.issue
                      ? <span className="text-red-400 font-medium">{item.issue}</span>
                      : <span className="text-green-400">OK</span>}
                  </TableCell>
                  <TableCell className="text-xs max-w-[180px]">
                    {editingCommentId === item.id ? (
                      <input
                        autoFocus
                        value={editingCommentValue}
                        onChange={e => setEditingCommentValue(e.target.value)}
                        onBlur={() => saveComment(item.id)}
                        onKeyDown={e => { if (e.key === "Enter") saveComment(item.id); if (e.key === "Escape") setEditingCommentId(null); }}
                        className="w-full bg-zinc-700 border border-zinc-500 rounded px-1.5 py-0.5 text-zinc-100 text-xs focus:outline-none focus:border-[#16a34a]"
                      />
                    ) : (
                      <button
                        onClick={() => startEditComment(item.id, item.comment)}
                        className="w-full text-left truncate group"
                        title={item.comment ? item.comment : "Click to add comment"}
                      >
                        {item.comment
                          ? <span className="text-zinc-400">{item.comment}</span>
                          : <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors">+ add comment</span>}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(() => {
                      const count = item.tickets?.[0]?.count ?? 0;
                      return count > 0
                        ? <span className="text-blue-400 font-medium">{count} ticket{count !== 1 ? "s" : ""}</span>
                        : <TicketIcon className="h-3.5 w-3.5 text-zinc-700" />;
                    })()}
                  </TableCell>
                  <TableCell>
                    {item.stock_verified_at ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                        <span className="text-xs text-green-400 font-medium">{item.stock_verified_by}</span>
                        <button
                          onClick={() => unverifyItem.mutate(item.id)}
                          className="ml-1 text-zinc-700 hover:text-red-400 transition-colors"
                          title="Remove verification"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-xs">
                    {item.stock_verified_at ? formatDate(item.stock_verified_at) : <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => openEditDialog(item)}
                      className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Edit item"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Owed Units Dialog */}
      <Dialog open={owedDialogOpen} onOpenChange={setOwedDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              Owed to Clients
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            {owedItems.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No owed units.</p>
            ) : (
              <>
                <p className="text-zinc-500 text-xs">Units received from clients for repair. GBX must send back a working replacement.</p>
                <div className="space-y-1.5 mt-3">
                  {owedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono text-zinc-300">{item.serial_number}</span>
                          <span className="text-xs text-zinc-500">{item.part_number}</span>
                        </div>
                        <p className="text-[11px] text-rose-400 mt-0.5">
                          {(item as ManufacturedItem & { clients?: { name: string } | null }).clients?.name ?? "Unknown client"}
                        </p>
                        {item.comment && <p className="text-[11px] text-zinc-600 mt-0.5 truncate">{item.comment}</p>}
                      </div>
                      <button
                        onClick={() => setReplacingItem(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded transition-colors shrink-0"
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        Replace
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Replace Owed Item Dialog */}
      {replacingItem && (
        <ReplaceOwedDialog
          item={replacingItem}
          gbxClientId={gbxClientId}
          replaceOwedItem={replaceOwedItem}
          onClose={() => setReplacingItem(null)}
        />
      )}

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Item</DialogTitle>
            {editItem && (
              <p className="text-zinc-500 text-sm font-mono">{editItem.part_number} · S/N {editItem.serial_number}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Issue */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Issue</Label>
              <Select value={editIssue} onValueChange={setEditIssue}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400">No issue — OK</SelectItem>
                  {issueDefinitions.map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-zinc-100">{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Comment</Label>
              <Input
                placeholder="Optional note…"
                value={editComment}
                onChange={e => setEditComment(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-sm"
              />
            </div>

            {/* Image */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Photo <span className="text-zinc-600 normal-case">(optional)</span></Label>
              {editPendingPreview ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editPendingPreview} alt="" className="h-16 w-16 rounded object-cover border border-zinc-700" />
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => { setEditPendingFile(null); setEditPendingPreview(null); }} className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
                      <X className="h-3 w-3" /> Remove
                    </button>
                    <label className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer">
                      <ImagePlus className="h-3 w-3" /> Replace
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (editPendingPreview) URL.revokeObjectURL(editPendingPreview);
                        setEditPendingFile(f);
                        setEditPendingPreview(URL.createObjectURL(f));
                      }} />
                    </label>
                  </div>
                </div>
              ) : editImageUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editImageUrl} alt="" className="h-16 w-16 rounded object-cover border border-zinc-700 cursor-pointer" onClick={() => setLightboxUrl(editImageUrl)} />
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={handleEditRemoveImage} disabled={removeItemImage.isPending} className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
                      <X className="h-3 w-3" /> {removeItemImage.isPending ? "Removing…" : "Remove image"}
                    </button>
                    <label className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer">
                      <ImagePlus className="h-3 w-3" /> Replace
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setEditPendingFile(f);
                        setEditPendingPreview(URL.createObjectURL(f));
                      }} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-20 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 cursor-pointer transition-colors text-zinc-600 hover:text-zinc-400">
                  <Camera className="h-5 w-5 mb-1" />
                  <span className="text-xs">Click to add photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setEditPendingFile(f);
                    setEditPendingPreview(URL.createObjectURL(f));
                  }} />
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditItem(null)} className="flex-1 px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={updateItem.isPending || uploadItemImage.isPending}
                className="flex-1 px-4 py-2 rounded-md bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {updateItem.isPending || uploadItemImage.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center cursor-pointer" onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          <button className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"><X className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  );
}
