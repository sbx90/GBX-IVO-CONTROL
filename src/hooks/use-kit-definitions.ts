"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { KitDefinition, CreateKitDefinitionInput } from "@/lib/types/database";

const supabase = createClient();

export function useKitDefinitions() {
  return useQuery({
    queryKey: ["kit_definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kit_definitions")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as KitDefinition[];
    },
  });
}

export function useCreateKitDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateKitDefinitionInput) => {
      const { data, error } = await supabase
        .from("kit_definitions")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as KitDefinition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kit_definitions"] });
      toast.success("Kit definition created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateKitDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CreateKitDefinitionInput>;
    }) => {
      const { data, error } = await supabase
        .from("kit_definitions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as KitDefinition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kit_definitions"] });
      toast.success("Kit definition updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKitDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("kit_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kit_definitions"] });
      toast.success("Kit definition deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
