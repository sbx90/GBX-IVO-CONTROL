import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/lib/permissions';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      return (data ?? null) as Profile | null;
    },
    staleTime: 5 * 60 * 1000, // role rarely changes — cache 5 min
  });
}
