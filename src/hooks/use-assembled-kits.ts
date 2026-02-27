import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  AssembledKit,
  AssembledKitFilters,
  CreateAssembledKitInput,
  AssembledKitStatus,
} from '@/lib/types/database';
import { toast } from 'sonner';

function getSupabase() {
  return createClient();
}

export function useAssembledKits(filters?: AssembledKitFilters) {
  return useQuery({
    queryKey: ['assembled_kits', filters],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('assembled_kits')
        .select('*, clients(id, name), product_units(id, component_type, serial_number, status)')
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters?.search) {
        query = query.ilike('kit_number', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AssembledKit[];
    },
  });
}

export function useAssembledKit(id: string) {
  return useQuery({
    queryKey: ['assembled_kit', id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('assembled_kits')
        .select('*, clients(id, name), product_units(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as AssembledKit;
    },
    enabled: !!id,
  });
}

export function useCreateAssembledKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAssembledKitInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Create the kit
      const { data: kit, error: kitError } = await supabase
        .from('assembled_kits')
        .insert({
          kit_number: input.kit_number,
          client_id: input.client_id || null,
          notes: input.notes || null,
          assembled_by: user?.id,
        })
        .select()
        .single();

      if (kitError) throw kitError;

      // Assign selected units to this kit
      if (input.unit_ids.length > 0) {
        const { error: unitsError } = await supabase
          .from('product_units')
          .update({ kit_id: kit.id, status: 'IN_KIT' })
          .in('id', input.unit_ids);

        if (unitsError) throw unitsError;
      }

      return kit as AssembledKit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembled_kits'] });
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Kit assembled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assemble kit: ${error.message}`);
    },
  });
}

export function useUpdateAssembledKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<AssembledKit, 'status' | 'client_id' | 'notes' | 'assembled_at'>>;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('assembled_kits')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AssembledKit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assembled_kits'] });
      queryClient.invalidateQueries({ queryKey: ['assembled_kit', data.id] });
      toast.success('Kit updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update kit: ${error.message}`);
    },
  });
}

export function useDeleteAssembledKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();

      // Return all units in this kit back to stock
      await supabase
        .from('product_units')
        .update({ kit_id: null, status: 'IN_STOCK' })
        .eq('kit_id', id);

      const { error } = await supabase
        .from('assembled_kits')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembled_kits'] });
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Kit deleted — units returned to stock');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete kit: ${error.message}`);
    },
  });
}

export function useAssignUnitsToKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      kitId,
      unitIds,
      prevUnitIds,
    }: {
      kitId: string;
      unitIds: string[];
      prevUnitIds: string[];
    }) => {
      const supabase = getSupabase();

      // Return removed units to stock
      const removedIds = prevUnitIds.filter((id) => !unitIds.includes(id));
      if (removedIds.length > 0) {
        await supabase
          .from('product_units')
          .update({ kit_id: null, status: 'IN_STOCK' })
          .in('id', removedIds);
      }

      // Assign new units
      const addedIds = unitIds.filter((id) => !prevUnitIds.includes(id));
      if (addedIds.length > 0) {
        await supabase
          .from('product_units')
          .update({ kit_id: kitId, status: 'IN_KIT' })
          .in('id', addedIds);
      }
    },
    onSuccess: (_, { kitId }) => {
      queryClient.invalidateQueries({ queryKey: ['assembled_kits'] });
      queryClient.invalidateQueries({ queryKey: ['assembled_kit', kitId] });
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Components updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update components: ${error.message}`);
    },
  });
}
