import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ProductUnit,
  ProductUnitFilters,
  CreateProductUnitInput,
  ProductUnitStatus,
} from '@/lib/types/database';
import { ENCLOSURE_SERIAL_SUFFIX, CELL_ANTENNA_SERIAL_SUFFIX } from '@/lib/constants';
import { toast } from 'sonner';

function getSupabase() {
  return createClient();
}

export function useProductUnits(filters?: ProductUnitFilters) {
  return useQuery({
    queryKey: ['product_units', filters],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('product_units')
        .select('*, assembled_kits(id, kit_number)')
        .order('created_at', { ascending: false });

      if (filters?.component_type && filters.component_type !== 'ALL') {
        query = query.eq('component_type', filters.component_type);
      }
      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters?.search) {
        query = query.ilike('serial_number', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ProductUnit[];
    },
  });
}

export function useCreateProductUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductUnitInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Duplicate check — serial number must be unique
      const { data: existing } = await supabase
        .from('product_units')
        .select('serial_number, component_type')
        .eq('serial_number', input.serial_number.trim())
        .maybeSingle();

      if (existing) {
        throw new Error(
          `Duplicate: "${input.serial_number}" already exists in stock as ${existing.component_type}`
        );
      }

      const { data, error } = await supabase
        .from('product_units')
        .insert({ ...input, added_by: user?.id })
        .select()
        .single();

      if (error) throw error;

      // Enclosure ships with Main Board — auto-create a paired ENCLOSURE unit
      if (input.component_type === 'MAIN_BOARD') {
        await supabase.from('product_units').insert({
          component_type: 'ENCLOSURE',
          serial_number: input.serial_number + ENCLOSURE_SERIAL_SUFFIX,
          added_by: user?.id,
          notes: `Paired with ${input.serial_number}`,
        });
      }

      // Cell Antenna ships with WiFi Antenna — auto-create a paired CELL_ANTENNA unit
      if (input.component_type === 'WIFI_ANTENNA') {
        await supabase.from('product_units').insert({
          component_type: 'CELL_ANTENNA',
          serial_number: input.serial_number + CELL_ANTENNA_SERIAL_SUFFIX,
          lot_number: input.lot_number ?? null,
          added_by: user?.id,
          notes: `Paired with ${input.serial_number}`,
        });
      }

      return data as ProductUnit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Unit added to stock');
    },
    onError: (error: Error) => {
      // Duplicate errors are shown as a centered dialog in the form — skip toast
      if (!error.message.startsWith('Duplicate:')) {
        toast.error(`Failed to add unit: ${error.message}`);
      }
    },
  });
}

export function useUpdateProductUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<ProductUnit, 'status' | 'notes' | 'part_number' | 'lot_number' | 'serial_number' | 'component_type'>>;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('product_units')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductUnit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Unit updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update unit: ${error.message}`);
    },
  });
}

export function useDeleteProductUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase();

      // Fetch unit to check if it's a MAIN_BOARD (so we can delete paired ENCLOSURE)
      const { data: unit } = await supabase
        .from('product_units')
        .select('component_type, serial_number')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('product_units')
        .delete()
        .eq('id', id);
      if (error) throw error;

      // Auto-delete paired ENCLOSURE unit
      if (unit?.component_type === 'MAIN_BOARD') {
        await supabase
          .from('product_units')
          .delete()
          .eq('serial_number', unit.serial_number + ENCLOSURE_SERIAL_SUFFIX)
          .eq('component_type', 'ENCLOSURE');
      }

      // Auto-delete paired CELL_ANTENNA unit
      if (unit?.component_type === 'WIFI_ANTENNA') {
        await supabase
          .from('product_units')
          .delete()
          .eq('serial_number', unit.serial_number + CELL_ANTENNA_SERIAL_SUFFIX)
          .eq('component_type', 'CELL_ANTENNA');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      toast.success('Unit removed from stock');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove unit: ${error.message}`);
    },
  });
}

export function useSetProductUnitStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ProductUnitStatus;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('product_units')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductUnit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_units'] });
      queryClient.invalidateQueries({ queryKey: ['assembled_kits'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}
