import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnvValue(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^['"]|['"]$/g, '').trim();
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  const upper = url.toUpperCase();
  if (
    upper.includes('YOUR_PROJECT_ID') ||
    upper.includes('YOUR_SUPABASE') ||
    upper.includes('MY_SUPABASE') ||
    upper.includes('MY_VITE_SUPABASE')
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidAnonKey(key: string): boolean {
  if (!key) return false;
  const upper = key.toUpperCase();
  if (
    upper.includes('YOUR_SUPABASE_ANON_KEY') ||
    upper.includes('MY_SUPABASE_ANON_KEY') ||
    upper.includes('MY_VITE_SUPABASE_ANON_KEY')
  ) {
    return false;
  }
  return true;
}

const rawUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const rawKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

if (isValidSupabaseUrl(rawUrl) && isValidAnonKey(rawKey)) {
  try {
    client = createClient(rawUrl, rawKey);
  } catch {
    client = null;
  }
}

export const supabase: SupabaseClient | null = client;
export const isSupabaseConfigured: boolean = Boolean(client);
