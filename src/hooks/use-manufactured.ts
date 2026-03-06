"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const supabase = createClient();
import type { ManufacturedItem, CreateManufacturedItemInput, LotImport, CreateLotImportInput, ManufacturedItemStatus, ManufacturedItemLocation } from "@/lib/types/database";



export function useManufacturedItemsAtLocation(location: ManufacturedItemLocation) {
  return useQuery({
    queryKey: ["manufactured_items", "location", location],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("*, clients(id, name)")
        .eq("location", location)
        .order("part_number", { ascending: true })
        .order("serial_number", { ascending: true });
      if (error) throw error;
      return data as ManufacturedItem[];
    },
  });
}

export function useManufacturedItems() {
  return useQuery({
    queryKey: ["manufactured_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ManufacturedItem[];
    },
  });
}

export function useDistinctManufacturedPartNumbers() {
  return useQuery({
    queryKey: ["manufactured_items", "part_numbers"],
    staleTime: 60_000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const seen = new Set<string>();
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("part_number")
          .order("part_number", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        for (const r of data ?? []) seen.add(r.part_number);
        if ((data?.length ?? 0) < PAGE_SIZE) break;
        page++;
      }
      return [...seen].sort();
    },
  });
}

export function useDistinctManufacturedLotNumbers() {
  return useQuery({
    queryKey: ["manufactured_items", "lot_numbers"],
    staleTime: 60_000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const seen = new Set<string>();
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("lot_number")
          .not("lot_number", "is", null)
          .order("lot_number", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        for (const r of data ?? []) seen.add(r.lot_number);
        if ((data?.length ?? 0) < PAGE_SIZE) break;
        page++;
      }
      return [...seen].sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ""), 10);
        const nb = parseInt(b.replace(/\D/g, ""), 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    },
  });
}

export function useManufacturedItemsPaginated(params: {
  page: number;
  pageSize: number;
  status: ManufacturedItemStatus | "ALL";
  search: string;
  clientId: string;
  hasIssue?: boolean;
  hasNoIssue?: boolean;
  hasTicket?: boolean;
  partNumbers?: string[];
  lotNumbers?: string[];
  sortCol?: string;
  sortDir?: "asc" | "desc";
}) {
  const { page, pageSize, status, search, clientId, hasIssue, hasNoIssue, hasTicket, partNumbers, lotNumbers, sortCol = "created_at", sortDir = "desc" } = params;
  return useQuery({
    queryKey: ["manufactured_items", "paginated", page, pageSize, status, search, clientId, hasIssue, hasNoIssue, hasTicket, partNumbers, lotNumbers, sortCol, sortDir],
    queryFn: async () => {
      const ticketsSelect = hasTicket ? "tickets!inner(count)" : "tickets(count)";
      let query = supabase
        .from("manufactured_items")
        .select(`*, clients(id, name), ${ticketsSelect}`, { count: "exact" })
        .order(sortCol, { ascending: sortDir === "asc" })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (status !== "ALL") query = query.eq("status", status);
      if (hasIssue) query = query.not("issue", "is", null).not("issue", "eq", "OK");
      if (hasNoIssue) query = query.or("issue.is.null,issue.eq.OK");
      if (search.trim()) {
        const q = search.trim();
        query = query.or(`part_number.ilike.%${q}%,serial_number.ilike.%${q}%,lot_number.ilike.%${q}%`);
      }
      if (clientId) query = query.eq("client_id", clientId);
      if (partNumbers && partNumbers.length > 0) query = query.in("part_number", partNumbers);
      if (lotNumbers && lotNumbers.length > 0) query = query.in("lot_number", lotNumbers);

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: data as ManufacturedItem[], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateManufacturedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManufacturedItemInput) => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ManufacturedItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("Item added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkCreateManufacturedItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: CreateManufacturedItemInput[]) => {
      if (items.length === 0) return;

      const { error } = await supabase
        .from("manufactured_items")
        .upsert(items, { onConflict: "part_number,serial_number" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("Items generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateManufacturedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CreateManufacturedItemInput>;
    }) => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ManufacturedItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("Item updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLotItemsLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotNumber, location }: { lotNumber: string; location: ManufacturedItemLocation }) => {
      const { error } = await supabase
        .from("manufactured_items")
        .update({ location })
        .eq("lot_number", lotNumber);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      qc.invalidateQueries({ queryKey: ["lot_locations"] });
      toast.success("Location updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteManufacturedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("manufactured_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("Item deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAllManufacturedItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("manufactured_items")
        .delete()
        .gte("created_at", "1900-01-01T00:00:00Z");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("All items deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLotImports() {
  return useQuery({
    queryKey: ["lot_imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_imports")
        .select("*, clients(id, name), production_orders(id, order_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LotImport[];
    },
  });
}

export function useCreateLotImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLotImportInput) => {
      const { data, error } = await supabase
        .from("lot_imports")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as LotImport;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lot_imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLotImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lot: { id: string; lot_number: string; docx_path: string | null; xlsx_path: string | null }) => {
      // Delete all manufactured items for this LOT
      const { error: itemsError } = await supabase
        .from("manufactured_items")
        .delete()
        .eq("lot_number", lot.lot_number);
      if (itemsError) throw itemsError;

      // Delete the lot_imports record
      const { error: lotError } = await supabase
        .from("lot_imports")
        .delete()
        .eq("id", lot.id);
      if (lotError) throw lotError;

      // Clean up storage files (best-effort)
      const paths = [lot.docx_path, lot.xlsx_path].filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from("lot-documents").remove(paths);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lot_imports"] });
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("LOT and all associated items deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useOrderPendingIssues(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ["manufactured_items", "pending_issues", orderId],
    enabled: !!orderId && enabled,
    queryFn: async () => {
      // Resolve via lot_imports (production_order_id is on the lot, not on individual items)
      const { data: lots, error: lotsErr } = await supabase
        .from("lot_imports")
        .select("lot_number")
        .eq("production_order_id", orderId);
      if (lotsErr) throw lotsErr;
      const lotNumbers = (lots ?? []).map((l: { lot_number: string }) => l.lot_number).filter(Boolean);
      if (lotNumbers.length === 0) return [];
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("id, part_number, serial_number, lot_number, issue")
        .in("lot_number", lotNumbers)
        .not("issue", "is", null)
        .order("issue")
        .order("part_number");
      if (error) throw error;
      return data as Pick<ManufacturedItem, "id" | "part_number" | "serial_number" | "lot_number" | "issue">[];
    },
  });
}

export function useResolveIssues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("manufactured_items")
        .update({ issue: null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success("Issues resolved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLotImportsByOrder(orderId: string) {
  return useQuery({
    queryKey: ["lot_imports", "order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_imports")
        .select("*")
        .eq("production_order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as LotImport[];
    },
    enabled: !!orderId,
  });
}

/** Returns the location per lot_number — one query per lot to avoid pagination issues. */
export function useLotLocations(lotNumbers: string[]) {
  return useQuery<Record<string, ManufacturedItemLocation>>({
    queryKey: ["lot_locations", lotNumbers],
    enabled: lotNumbers.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        lotNumbers.map((lotNumber) =>
          supabase
            .from("manufactured_items")
            .select("lot_number, location")
            .eq("lot_number", lotNumber)
            .not("location", "is", null)
            .limit(1)
            .maybeSingle()
        )
      );
      const result: Record<string, ManufacturedItemLocation> = {};
      for (const { data } of results) {
        if (data?.lot_number && data.location) {
          result[data.lot_number] = data.location as ManufacturedItemLocation;
        }
      }
      return result;
    },
  });
}

/** Returns good-item counts per lot_number (same filter as useOrderFulfillmentDetail). */
export function useManufacturedLotCounts(lotNumbers: string[]) {
  return useQuery({
    queryKey: ["manufactured_items", "lot_good_counts", lotNumbers],
    enabled: lotNumbers.length > 0,
    queryFn: async () => {
      const results: { lot_number: string }[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("lot_number")
          .in("lot_number", lotNumbers)
          .not("status", "in", '("BAD","MANUAL","EXTRA")')
          .or("issue.is.null,issue.eq.OK")
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        results.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
        page++;
      }
      const counts: Record<string, number> = {};
      for (const r of results) {
        counts[r.lot_number] = (counts[r.lot_number] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useLotItemCounts(lotNumber: string | null) {
  return useQuery({
    queryKey: ["manufactured_items", "lot_counts", lotNumber],
    enabled: !!lotNumber,
    queryFn: async () => {
      // Paginate — lot can have 1000+ items
      const results: { part_number: string }[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("part_number")
          .eq("lot_number", lotNumber!)
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        results.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
        page++;
      }
      const counts: Record<string, number> = {};
      for (const r of results) {
        counts[r.part_number] = (counts[r.part_number] ?? 0) + 1;
      }
      return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([part_number, count]) => ({ part_number, count }));
    },
  });
}

export function useSubtractLotItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotNumber, partNumber, count }: { lotNumber: string; partNumber: string; count: number }) => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("id")
        .eq("lot_number", lotNumber)
        .eq("part_number", partNumber)
        .order("created_at", { ascending: false })
        .limit(count);
      if (error) throw error;
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return 0;
      const { error: delError } = await supabase.from("manufactured_items").delete().in("id", ids);
      if (delError) throw delError;
      return ids.length;
    },
    onSuccess: (removed) => {
      qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      toast.success(`Removed ${removed} item${removed !== 1 ? "s" : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLotImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateLotImportInput> }) => {
      const { data, error } = await supabase
        .from("lot_imports")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LotImport;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lot_imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── GBX Warehouse Stock Verification ─────────────────────────────────────────

export function useGBXWarehouseStock(clientId: string | null) {
  return useQuery({
    queryKey: ["gbx_warehouse_stock", clientId],
    staleTime: 30_000,
    enabled: !!clientId,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const all: ManufacturedItem[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("id, part_number, serial_number, lot_number, box_label, status, location, issue, stock_verified_at, stock_verified_by, clients(id, name)")
          .eq("client_id", clientId!)
          .order("part_number", { ascending: true })
          .order("serial_number", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        all.push(...(data as unknown as ManufacturedItem[]));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
        page++;
      }
      return all;
    },
  });
}

export function useVerifyStockItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serials, verifiedBy, clientId }: { serials: string[]; verifiedBy: string; clientId: string }) => {
      const now = new Date().toISOString();
      const CHUNK = 500;
      let totalMatched = 0;
      const notFound: string[] = [];
      const matchedItems: { id: string; serial_number: string; part_number: string; issue: string | null }[] = [];
      for (let i = 0; i < serials.length; i += CHUNK) {
        const chunk = serials.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("manufactured_items")
          .select("id, serial_number, part_number, issue, stock_verified_at")
          .eq("client_id", clientId)
          .in("serial_number", chunk);
        if (error) throw error;
        const found = (data ?? []) as { id: string; serial_number: string; part_number: string; issue: string | null; stock_verified_at: string | null }[];
        const foundSerials = new Set(found.map(f => f.serial_number));
        const toVerify = found.filter(f => !f.stock_verified_at);
        const toVerifyIds = toVerify.map(f => f.id);
        notFound.push(...chunk.filter(s => !foundSerials.has(s)));
        if (toVerifyIds.length > 0) {
          const { error: updErr } = await supabase
            .from("manufactured_items")
            .update({ stock_verified_at: now, stock_verified_by: verifiedBy })
            .in("id", toVerifyIds);
          if (updErr) throw updErr;
          totalMatched += toVerifyIds.length;
          matchedItems.push(...toVerify.map(f => ({ id: f.id, serial_number: f.serial_number, part_number: f.part_number, issue: f.issue })));
        }
      }
      return { matched: totalMatched, notFound, matchedItems };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUnverifyStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("manufactured_items")
        .update({ stock_verified_at: null, stock_verified_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Look up an item by serial number across all clients (for OWE detection)
export function useLookupItemBySerial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serial, verifiedBy }: { serial: string; verifiedBy: string }) => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("id, serial_number, part_number, issue, client_id, stock_verified_at, clients(id, name)")
        .eq("serial_number", serial)
        .limit(1)
        .single();
      if (error) return null;
      const item = data as unknown as ManufacturedItem & { clients: { id: string; name: string } | null };
      // Mark as received (stock verified)
      if (!item.stock_verified_at) {
        await supabase.from("manufactured_items")
          .update({ stock_verified_at: new Date().toISOString(), stock_verified_by: verifiedBy })
          .eq("id", item.id);
      }
      return item;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useOwedItems() {
  return useQuery({
    queryKey: ["manufactured_items", "owed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("*, clients(id, name)")
        .eq("status", "OWE")
        .order("client_id", { ascending: true })
        .order("part_number", { ascending: true });
      if (error) throw error;
      return data as ManufacturedItem[];
    },
  });
}

export function useAvailableReplacements(partNumber: string, gbxClientId: string | null) {
  return useQuery({
    queryKey: ["manufactured_items", "replacements", partNumber, gbxClientId],
    enabled: !!partNumber && !!gbxClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("id, part_number, serial_number, lot_number")
        .eq("part_number", partNumber)
        .eq("status", "OK")
        .eq("client_id", gbxClientId!)
        .or("issue.is.null,issue.eq.")
        .order("serial_number", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data as Pick<ManufacturedItem, "id" | "part_number" | "serial_number" | "lot_number">[];
    },
  });
}

export function useReplaceOwedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      owedItem,
      replacementId,
      replacementSerial,
    }: {
      owedItem: ManufacturedItem;
      replacementId: string;
      replacementSerial: string;
    }) => {
      // Send replacement to client
      const { error: e1 } = await supabase
        .from("manufactured_items")
        .update({ status: "AT_CLIENT", client_id: owedItem.client_id })
        .eq("id", replacementId);
      if (e1) throw e1;
      // Note the replacement on the owed item
      const note = `Replaced by ${replacementSerial}`;
      const updatedComment = owedItem.comment ? `${owedItem.comment} | ${note}` : note;
      const { error: e2 } = await supabase
        .from("manufactured_items")
        .update({ comment: updatedComment })
        .eq("id", owedItem.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items", "owed"] });
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
      qc.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
      toast.success("Replacement sent to client");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUploadItemImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, file }: { itemId: string; file: File }) => {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${itemId}/${timestamp}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from("item-images").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("item-images").getPublicUrl(filePath);
      const { error } = await supabase.from("manufactured_items").update({ image_url: publicUrl }).eq("id", itemId);
      if (error) throw error;
      return publicUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
      qc.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveItemImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, imageUrl }: { itemId: string; imageUrl: string }) => {
      try {
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split("/item-images/");
        if (pathParts[1]) await supabase.storage.from("item-images").remove([pathParts[1]]);
      } catch { /* ignore storage errors — still clear the DB field */ }
      const { error } = await supabase.from("manufactured_items").update({ image_url: null }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
      qc.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkIssueManufacturedItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serials, issue, partNumber, lotNumber }: { serials: string[]; issue: string | null; partNumber: string; lotNumber?: string }) => {
      const CHUNK = 500;
      let totalMatched = 0;
      const notFound: string[] = [];
      const alreadySet: string[] = [];
      for (let i = 0; i < serials.length; i += CHUNK) {
        const chunk = serials.slice(i, i + CHUNK);
        let query = supabase
          .from("manufactured_items")
          .select("id, serial_number, issue")
          .eq("part_number", partNumber)
          .in("serial_number", chunk);
        if (lotNumber) query = query.eq("lot_number", lotNumber);
        const { data, error } = await query;
        if (error) throw error;
        const foundSerials = new Set((data ?? []).map((r: { serial_number: string }) => r.serial_number));
        for (const sn of chunk) { if (!foundSerials.has(sn)) notFound.push(sn); }
        const toUpdate = (data ?? []).filter((r: { issue: string | null }) => r.issue !== issue);
        const alreadyOk = (data ?? []).filter((r: { issue: string | null }) => r.issue === issue);
        alreadySet.push(...alreadyOk.map((r: { serial_number: string }) => r.serial_number));
        const ids = toUpdate.map((r: { id: string }) => r.id);
        if (ids.length > 0) {
          const { error: updErr } = await supabase
            .from("manufactured_items")
            .update({ issue })
            .in("id", ids);
          if (updErr) throw updErr;
          totalMatched += ids.length;
        }
      }
      return { matched: totalMatched, notFound, alreadySet };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
