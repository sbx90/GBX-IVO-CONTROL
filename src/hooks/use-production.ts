import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ProductionOrder,
  ProductionStep,
  ProductionFilters,
  CreateOrderInput,
  ProductionStepStatus,
} from "@/lib/types/database";
import { toast } from "sonner";

function getSupabase() {
  return createClient();
}

// ─── Queries ───────────────────────────────────────────────────

export function useProductionOrders(filters?: ProductionFilters) {
  return useQuery({
    queryKey: ["orders", filters],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from("production_orders")
        .select("*, production_steps(*)")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "ALL") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Sort steps by step_number within each order
      return (data as ProductionOrder[]).map((order) => ({
        ...order,
        production_steps: order.production_steps?.sort(
          (a, b) => a.step_number - b.step_number
        ),
      }));
    },
  });
}

export function useProductionOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("production_orders")
        .select("*, production_steps(*)")
        .eq("id", id)
        .single();

      if (error) throw error;

      return {
        ...data,
        production_steps: (data as ProductionOrder).production_steps?.sort(
          (a, b) => a.step_number - b.step_number
        ),
      } as ProductionOrder;
    },
    enabled: !!id,
  });
}

// ─── Mutations ─────────────────────────────────────────────────

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("production_orders")
        .insert({ ...input, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Production order created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create order: ${error.message}`);
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<
        Pick<ProductionOrder, "status" | "notes" | "target_date" | "current_step" | "manufacture_code">
      >;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("production_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", data.id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update order: ${error.message}`);
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("production_orders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete order: ${error.message}`);
    },
  });
}

export function useUpdateStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      step,
      newStatus,
    }: {
      step: ProductionStep;
      newStatus: ProductionStepStatus;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updates: Partial<ProductionStep> = { status: newStatus };

      if (newStatus === "ACTIVE") {
        updates.started_at = new Date().toISOString();
      }
      if (newStatus === "DONE") {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user?.id ?? undefined;
      }

      const { data, error } = await supabase
        .from("production_steps")
        .update(updates)
        .eq("id", step.id)
        .select()
        .single();

      if (error) throw error;

      const updatedStep = data as ProductionStep;

      // Update order's current_step
      if (newStatus === "ACTIVE") {
        await supabase
          .from("production_orders")
          .update({ current_step: step.step_number })
          .eq("id", step.order_id);
      }

      // If the last step (11) is DONE, mark the order as COMPLETE
      if (newStatus === "DONE" && step.step_number === 11) {
        await supabase
          .from("production_orders")
          .update({ status: "COMPLETE" })
          .eq("id", step.order_id);
        toast.success("Production order complete! 🎉");
      } else if (newStatus === "DONE") {
        toast.success(`Step ${step.step_number} completed`);
      }

      return updatedStep;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["order", data.order_id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update step: ${error.message}`);
    },
  });
}

export function useUpdateStepNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      orderId,
      notes,
    }: {
      id: string;
      orderId: string;
      notes: string;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("production_steps")
        .update({ notes })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: data as ProductionStep, orderId };
    },
    onSuccess: ({ orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });
}
