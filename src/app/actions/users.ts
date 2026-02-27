'use server';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { UserRole } from '@/lib/permissions';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') throw new Error('Not authorized');
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  created_at: string;
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  await requireAdmin();
  const admin = getAdminClient();

  const { data: { users }, error } = await admin.auth.admin.listUsers();
  if (error) throw error;

  const { data: profiles } = await admin.from('profiles').select('*');
  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  return users
    .map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? '',
        full_name: profile?.full_name ?? null,
        role: (profile?.role ?? null) as UserRole | null,
        created_at: u.created_at,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function createTeamMember(
  email: string,
  password: string,
  role: UserRole,
  fullName: string
): Promise<void> {
  await requireAdmin();
  const admin = getAdminClient();

  const { data: { user }, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!user) throw new Error('Failed to create user');

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: user.id, role, full_name: fullName || null });

  if (profileError) {
    await admin.auth.admin.deleteUser(user.id);
    throw profileError;
  }
}

export async function updateTeamMemberRole(userId: string, role: UserRole): Promise<void> {
  await requireAdmin();
  const admin = getAdminClient();

  const { error } = await admin
    .from('profiles')
    .upsert({ id: userId, role }, { onConflict: 'id' });

  if (error) throw error;
}

export async function deleteTeamMember(userId: string): Promise<void> {
  await requireAdmin();
  const admin = getAdminClient();

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
