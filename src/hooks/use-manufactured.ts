"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ManufacturedItem, CreateManufacturedItemInput, LotImport, CreateLotImportInput, ManufacturedItemStatus, ManufacturedItemLocation } from "@/lib/types/database";

const supabase = createClient();

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
      return [...seen].sort();
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
