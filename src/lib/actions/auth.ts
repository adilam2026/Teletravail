"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syntheticEmail } from "@/lib/auth-utils";
import { homePathForRole } from "@/lib/auth/session";
import { perfTime } from "@/lib/perf";

export interface SignInResult {
  ok: boolean;
  error?: string;
  /** Destination déjà résolue (rôle → page d'accueil) pour éviter le détour par "/" (section 6). */
  redirectTo?: string;
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
 *
 * Une seule requête sert à la fois à résoudre l'email et à récupérer le
 * rôle (pour renvoyer directement la bonne destination) : le client fait
 * un unique `router.replace(redirectTo)` au lieu de rebondir sur "/" qui
 * relirait le profil et redirigerait une seconde fois (section 6-7).
 */
export async function signInWithLogin(login: string, password: string): Promise<SignInResult> {
  const trimmed = login.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: "Identifiant ou mot de passe incorrect." };

  const admin = createAdminClient();
  // eq() (pas ilike()) pour utiliser l'index unique sur login : le login est
  // déjà normalisé en minuscules à la création du compte.
  const row = await perfTime("login: resolve email", () =>
    admin.from("profiles").select("email, login, status, role").eq("login", trimmed).maybeSingle().then((r) => r.data)
  );
  if (!row || row.status === "inactive") return { ok: false, error: "Identifiant ou mot de passe incorrect." };
  const email = row.email ?? syntheticEmail(trimmed);

  const supabase = await createClient();
  const { error } = await perfTime("login: signInWithPassword", () => supabase.auth.signInWithPassword({ email, password }));
  if (error) return { ok: false, error: "Identifiant ou mot de passe incorrect." };

  return { ok: true, redirectTo: homePathForRole(row.role) };
}

/** Déconnexion côté serveur, pour la même raison que `signInWithLogin`. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
