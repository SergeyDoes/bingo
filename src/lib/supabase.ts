import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { tr } from './i18n';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(tr('Для входа и сохранения бинго добавьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в файл .env.local.', 'To sign in and save bingo events, add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.'));
  }
  return supabase;
}
