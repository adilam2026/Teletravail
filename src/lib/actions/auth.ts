"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syntheticEmail } from "@/lib/auth-utils";

async function resolveLoginEmailInternal(login: string): Promise<string | null> {
  const trimmed = login.trim().toLowerCase();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email, login, status").ilike("login", trimmed).maybeSingle();

  if (!data || data.status === "inactive") return null;
  return data.email ?? syntheticEmail(trimmed);
}

/**
 * Résout un identifiant (`login`) en email Supabase Auth. Exposé séparément
 * pour l'affichage éventuel côté client, mais la connexion elle-même passe
 * désormais entièrement par `signInWithLogin` ci-dessous.
 */
export async function resolveLoginEmail(login: string): Promise<string | null> {
  return resolveLoginEmailInternal(login);
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/**
 * Connexion entièrement côté serveur : le navigateur n'appelle jamais
 * directement l'API Supabase Auth, il n'appelle que ce serveur (même
 * origine que l'application). Certains réseaux d'entreprise / VPN /
 * antivirus avec inspection HTTPS bloquent ou corrompent la requête CORS
 * que le SDK Supabase enverrait depuis le navigateur vers
 * *.supabase.co — en la faisant partir de notre serveur (Vercel), ce
 * problème réseau côté client disparaît complètement. La session est
 * posée via les cookies gérés par `@supabase/ssr`, exactement comme pour
 * le reste de l'application.
 */
export async function signInWithLogin(login: string, password: string): Promise<SignInResult> {
  const email = await resolveLoginEmailInternal(login);
  if (!email) return { ok: false, error: "Identifiant ou mot de passe incorrect." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Identifiant ou mot de passe incorrect." };

  return { ok: true };
}

/** Déconnexion côté serveur, pour la même raison que `signInWithLogin`. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
