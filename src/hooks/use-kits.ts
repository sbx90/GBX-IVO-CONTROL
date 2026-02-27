import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Kit,
  KitComponent,
  MainboardSectionRecord,
  KitFilters,
  CreateKitInput,
  ComponentStatus,
  IssueCategory,
} from "@/lib/types/database";
import { toast } from "sonner";

function getSupabase() {
  return createClient();
}

// ─── Queries ───────────────────────────────────────────────────

export function useKits(filters?: KitFilters) {
  return useQuery({
    queryKey: ["kits", filters],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from("kits")
        .select("*, tickets(count)")
        .order("created_at", { ascending: false });

      if (filters?.type && filters.type !== "ALL") {
        query = query.eq("type", filters.type);
      }
      if (filters?.status && filters.status !== "ALL") {
        query = query.eq("status", filters.status);
      }
      if (filters?.search) {
        query = query.ilike("serial_number", `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Kit[];
    },
  });
}

export function useKit(id: string) {
  return useQuery({
    queryKey: ["kit", id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("kits")
        .select(
          "*, kit_components(*, mainboard_sections(*)), tickets(*, kit_components(id, component_type), mainboard_sections(id, section_name))"
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Kit;
    },
    enabled: !!id,
  });
}

// ─── Mutations ─────────────────────────────────────────────────

export function useCreateKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateKitInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("kits")
        .insert({ ...input, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data as Kit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      toast.success("Kit created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create kit: ${error.message}`);
    },
  });
}

export function useUpdateKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Kit, "status" | "notes" | "type">>;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("kits")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Kit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      queryClient.invalidateQueries({ queryKey: ["kit", data.id] });
      toast.success("Kit updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update kit: ${error.message}`);
    },
  });
}

export function useUpdateKitComponent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      kitId,
      updates,
    }: {
      id: string;
      kitId: string;
      updates: Partial<
        Pick<
          KitComponent,
          "status" | "notes" | "serial_number" | "fault_category"
        >
      >;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("kit_components")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: data as KitComponent, kitId };
    },
    onSuccess: ({ kitId }) => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      toast.success("Component updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update component: ${error.message}`);
    },
  });
}

export function useUpdateMainboardSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      kitId,
      updates,
    }: {
      id: string;
      kitId: string;
      updates: Partial<
        Pick<MainboardSectionRecord, "status" | "notes" | "issue_category">
      >;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("mainboard_sections")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: data as MainboardSectionRecord, kitId };
    },
    onSuccess: ({ kitId }) => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      toast.success("Section updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update section: ${error.message}`);
    },
  });
}

export function useDeleteKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("kits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      toast.success("Kit deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete kit: ${error.message}`);
    },
  });
}
