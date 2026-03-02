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

export function useManufacturedItemsPaginated(params: {
  page: number;
  pageSize: number;
  status: ManufacturedItemStatus | "ALL";
  search: string;
  clientId: string;
}) {
  const { page, pageSize, status, search, clientId } = params;
  return useQuery({
    queryKey: ["manufactured_items", "paginated", page, pageSize, status, search, clientId],
    queryFn: async () => {
      let query = supabase
        .from("manufactured_items")
        .select("*, clients(id, name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (status !== "ALL") query = query.eq("status", status);
      if (search.trim()) {
        const q = search.trim();
        query = query.or(`part_number.ilike.%${q}%,serial_number.ilike.%${q}%,lot_number.ilike.%${q}%`);
      }
      if (clientId) query = query.eq("client_id", clientId);

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
      const { error } = await supabase
        .from("manufactured_items")
        .upsert(items, { onConflict: "part_number,serial_number", ignoreDuplicates: true });
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
