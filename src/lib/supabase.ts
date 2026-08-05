import { createClient } from "@supabase/supabase-js";

/**
 * Eigen Supabase project.
 * Zet in .env (lokaal) of in de deploy-omgeving:
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (import.meta.env.SUPABASE_URL as string | undefined) ??
  "";

const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined) ??
  "";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder", {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PHOTO_BUCKET = "photos";
export const SITE_BUCKET = "site_images";

export function getSiteImageStorageUrl(path: string | null | undefined) {
  if (!path) return null;

  return supabase.storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl;
}
