import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Client "service role" — contourne RLS. Réservé aux server actions qui
 * doivent gérer le cycle de vie des comptes Supabase Auth (création,
 * réinitialisation de mot de passe) : ces opérations exigent l'API Admin et
 * ne passent jamais par le navigateur. Chaque appelant doit revalider les
 * droits métier (rôle, périmètre d'équipe) AVANT d'utiliser ce client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant : requis pour les actions d'administration des comptes");
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
