import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Ticket,
  TicketComment,
  TicketAttachment,
  TicketFilters,
  CreateTicketInput,
  ManufacturedItem,
} from "@/lib/types/database";
import { toast } from "sonner";

function getSupabase() {
  return createClient();
}

// ─── Queries ───────────────────────────────────────────────────

export function useSearchManufacturedItems(query: string) {
  return useQuery({
    queryKey: ["manufactured_items", "search", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("manufactured_items")
        .select("id, part_number, serial_number, lot_number, client_id")
        .or(`serial_number.ilike.%${query}%,part_number.ilike.%${query}%`)
        .limit(20);
      if (error) throw error;
      return data as Pick<ManufacturedItem, "id" | "part_number" | "serial_number" | "lot_number" | "client_id">[];
    },
    staleTime: 10_000,
  });
}

export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from("tickets")
        .select("*, kits(id, serial_number, status), manufactured_items(id, part_number, serial_number), ticket_manufactured_items(id, manufactured_item_id, manufactured_items(id, part_number, serial_number))")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "ALL") {
        query = query.eq("status", filters.status);
      }
      if (filters?.priority && filters.priority !== "ALL") {
        query = query.eq("priority", filters.priority);
      }
      if (filters?.issue_category && filters.issue_category !== "ALL") {
        query = query.eq("issue_category", filters.issue_category);
      }
      if (filters?.search) {
        query = query.ilike("title", `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Ticket[];
    },
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "*, kits(*), kit_components(id, component_type), mainboard_sections(id, section_name), manufactured_items(id, part_number, serial_number), ticket_manufactured_items(id, manufactured_item_id, manufactured_items(id, part_number, serial_number)), ticket_comments(*, ticket_attachments(*)), ticket_attachments(*)"
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Ticket;
    },
    enabled: !!id,
  });
}

// ─── Mutations ─────────────────────────────────────────────────

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTicketInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Insert ticket
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({ ...input, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;

      // Auto-update kit status to TICKET if it is currently OK
      if (input.kit_id) {
        const { data: kit } = await supabase
          .from("kits")
          .select("status")
          .eq("id", input.kit_id)
          .single();

        if (kit?.status === "OK") {
          await supabase
            .from("kits")
            .update({ status: "TICKET" })
            .eq("id", input.kit_id);
        }
      }

      // Link manufactured items via join table
      if (input.manufactured_item_ids && input.manufactured_item_ids.length > 0) {
        await supabase.from("ticket_manufactured_items").insert(
          input.manufactured_item_ids.map((mid) => ({
            ticket_id: ticket.id,
            manufactured_item_id: mid,
          }))
        );
      }

      return ticket as Ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      if (ticket.kit_id) queryClient.invalidateQueries({ queryKey: ["kit", ticket.kit_id] });
      queryClient.invalidateQueries({ queryKey: ["manufactured_items", "paginated"] });
      queryClient.invalidateQueries({ queryKey: ["gbx_warehouse_stock"] });
      toast.success("Ticket created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create ticket: ${error.message}`);
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<
        Pick<Ticket, "status" | "priority" | "assigned_to" | "description" | "resolved_at">
      >;
    }) => {
      const supabase = getSupabase();

      // Set resolved_at when moving to RESOLVED
      const resolvedAt =
        updates.status === "RESOLVED"
          ? { resolved_at: new Date().toISOString() }
          : {};

      const { data, error } = await supabase
        .from("tickets")
        .update({ ...updates, ...resolvedAt })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Ticket;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", data.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update ticket: ${error.message}`);
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      content,
    }: {
      ticketId: string;
      content: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("ticket_comments")
        .insert({ ticket_id: ticketId, content, author_id: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data as TicketComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", data.ticket_id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to add comment: ${error.message}`);
    },
  });
}

export function useAddAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      commentId,
      file,
    }: {
      ticketId: string;
      commentId?: string;
      file: File;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Upload file to storage
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `tickets/${ticketId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);

      // Insert attachment record
      const { data, error } = await supabase
        .from("ticket_attachments")
        .insert({
          ticket_id: ticketId,
          comment_id: commentId ?? null,
          file_url: publicUrl,
          file_name: file.name,
          file_type: file.type,
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TicketAttachment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", data.ticket_id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to upload attachment: ${error.message}`);
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      toast.success("Ticket deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete ticket: ${error.message}`);
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attachment,
    }: {
      attachment: TicketAttachment;
    }) => {
      const supabase = getSupabase();

      // Extract storage path from URL
      const url = new URL(attachment.file_url);
      const pathParts = url.pathname.split("/ticket-attachments/");
      if (pathParts[1]) {
        await supabase.storage
          .from("ticket-attachments")
          .remove([pathParts[1]]);
      }

      const { error } = await supabase
        .from("ticket_attachments")
        .delete()
        .eq("id", attachment.id);

      if (error) throw error;
      return attachment;
    },
    onSuccess: (attachment) => {
      queryClient.invalidateQueries({
        queryKey: ["ticket", attachment.ticket_id],
      });
      toast.success("Attachment deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete attachment: ${error.message}`);
    },
  });
}
