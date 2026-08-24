"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { syntheticEmail } from "@/lib/auth-utils";

/**
 * Résout un identifiant (`login`) en email Supabase Auth avant la tentative
 * de connexion. Exécuté côté serveur avec le client "service role" car aucun
 * utilisateur n'est encore authentifié à ce stade (RLS ne s'applique pas).
 * Ne renvoie que l'email associé — jamais d'autre information du profil — le
 * mot de passe reste vérifié par Supabase Auth lui-même.
 */
export async function resolveLoginEmail(login: string): Promise<string | null> {
  const trimmed = login.trim().toLowerCase();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email, login, status").ilike("login", trimmed).maybeSingle();

  if (!data || data.status === "inactive") return null;
  return data.email ?? syntheticEmail(trimmed);
}
