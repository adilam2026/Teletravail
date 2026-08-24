"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Premier changement de mot de passe obligatoire (et changement volontaire ultérieur). */
export async function changeOwnPassword(newPassword: string): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
  if (pwError) return { ok: false, error: "Impossible de mettre à jour le mot de passe." };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (profileError) return { ok: false, error: "Mot de passe mis à jour, mais le profil n'a pas pu être actualisé." };

  await logAudit({ action: "password_changed", entityType: "profile", entityId: user.id });
  revalidatePath("/");
  return { ok: true };
}
