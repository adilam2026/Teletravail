import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { perfTime } from "@/lib/perf";
import type { AppRole, ProfileRow } from "@/lib/supabase/database.types";

export interface CurrentUser {
  authId: string;
  profile: ProfileRow;
}

/**
 * Utilisateur connecté + son profil métier, ou `null` si non authentifié.
 *
 * Deux optimisations (section 6/28/29 du cahier des charges perf) :
 * - `cache()` de React dédoublonne les appels au sein d'une même requête —
 *   layout ET page appellent chacun `requireUser()`, ça ne doit coûter
 *   qu'un seul aller-retour, pas deux ou trois.
 * - Le middleware a déjà revalidé le JWT auprès de Supabase Auth (appel
 *   réseau) et transmet l'id vérifié en en-tête ; on l'utilise directement
 *   au lieu de rappeler `getUser()` (encore un aller-retour réseau évité).
 *   Route non couverte par le middleware (cas limite) → on retombe sur
 *   `getUser()`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return perfTime("auth: getCurrentUser (requête réelle, dédupliquée par requête via React.cache)", async () => {
    const supabase = await createClient();

    const headerList = await headers();
    let authId = headerList.get("x-verified-user-id");

    if (!authId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authId = user?.id ?? null;
    }
    if (!authId) return null;

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", authId).single();
    if (!profile) return null;

    return { authId, profile };
  });
});

/** À utiliser en haut d'une page/layout : redirige vers /login si non connecté. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.status === "inactive") redirect("/login?error=inactive");
  if (user.profile.must_change_password) redirect("/change-password");
  return user;
}

/** À utiliser en haut d'une page réservée à un rôle donné (ou plusieurs, ex. écrans de validation partagés). */
export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) redirect(homePathForRole(user.profile.role));
  return user;
}

export function homePathForRole(role: AppRole): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "du_head") return "/du/overview";
  if (role === "tribe_lead") return "/tribe/overview";
  if (role === "squad_lead") return "/squad/planning";
  return "/employee/agenda";
}
