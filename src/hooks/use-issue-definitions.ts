"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { IssueDefinition, CreateIssueDefinitionInput } from "@/lib/types/database";

const supabase = createClient();

export function useIssueDefinitions() {
  return useQuery({
    queryKey: ["issue_definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_definitions")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as IssueDefinition[];
    },
  });
}

export function useCreateIssueDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueDefinitionInput) => {
      const { data, error } = await supabase
        .from("issue_definitions")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as IssueDefinition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue_definitions"] });
      toast.success("Issue definition created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateIssueDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CreateIssueDefinitionInput>;
    }) => {
      const { data, error } = await supabase
        .from("issue_definitions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as IssueDefinition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue_definitions"] });
      toast.success("Issue definition updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteIssueDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("issue_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue_definitions"] });
      toast.success("Issue definition deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
