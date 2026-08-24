import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";

export interface CurrentUser {
  authId: string;
  profile: ProfileRow;
}

/** Utilisateur connecté + son profil métier, ou `null` si non authentifié. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;

  return { authId: user.id, profile };
}

/** À utiliser en haut d'une page/layout : redirige vers /login si non connecté. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.status === "inactive") redirect("/login?error=inactive");
  if (user.profile.must_change_password) redirect("/change-password");
  return user;
}

/** À utiliser en haut d'une page réservée à un rôle donné. */
export async function requireRole(role: "admin" | "manager" | "employee"): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.profile.role !== role) redirect(homePathForRole(user.profile.role));
  return user;
}

export function homePathForRole(role: "admin" | "manager" | "employee"): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "manager") return "/manager/team";
  return "/employee/agenda";
}
