import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Env vars are baked in at build time for NEXT_PUBLIC_* — fallback prevents
  // prerender crashes in SSR context when module-level clients are initialized.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  );
}
