"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ProductCatalogItem } from "@/lib/types/database";

const supabase = createClient();

export function useProductCatalog() {
  return useQuery({
    queryKey: ["product_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("*")
        .order("part_number", { ascending: true });
      if (error) throw error;
      return data as ProductCatalogItem[];
    },
  });
}

export function useAddProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (part_number: string) => {
      const { data, error } = await supabase
        .from("product_catalog")
        .insert({ part_number })
        .select()
        .single();
      if (error) throw error;
      return data as ProductCatalogItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_catalog"] });
      toast.success("Part number added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, part_number }: { id: string; part_number: string }) => {
      const { data, error } = await supabase
        .from("product_catalog")
        .update({ part_number })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductCatalogItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_catalog"] });
      toast.success("Part number updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProductCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_catalog")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_catalog"] });
      toast.success("Part number deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
