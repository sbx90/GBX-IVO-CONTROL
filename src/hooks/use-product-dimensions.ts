"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ProductDimension, UpsertProductDimensionInput } from "@/lib/types/database";

const supabase = createClient();

export function useProductDimensions() {
  return useQuery({
    queryKey: ["product_dimensions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_dimensions")
        .select("*")
        .order("part_number", { ascending: true });
      if (error) throw error;
      return data as ProductDimension[];
    },
  });
}

export function useUpsertProductDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertProductDimensionInput) => {
      const { data, error } = await supabase
        .from("product_dimensions")
        .upsert(input, { onConflict: "part_number" })
        .select()
        .single();
      if (error) throw error;
      return data as ProductDimension;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_dimensions"] });
      toast.success("Dimension saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProductDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_dimensions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_dimensions"] });
      toast.success("Dimension deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
