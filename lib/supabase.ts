import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the findings store.
 *
 * The publishable (anon) key is safe to ship in the client bundle by design;
 * Row Level Security on the database is the enforcement layer (read-only
 * everywhere except review decisions and audit-event inserts). Values can be
 * overridden per-environment in Vercel without a code change.
 */
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://yrqjiomgpbhyfzrcugyg.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable__MsKhlKKNuj75Vclq5JfMw_3A2d8gJL";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) client = createClient(url, key);
  return client;
}
