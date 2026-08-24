"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";

export async function createTeam(name: string, managerId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").insert({ name, manager_id: managerId }).select("id").single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "team_created", entityType: "team", entityId: data.id, newValue: { name, managerId } });
  revalidatePath("/admin/teams");
  return { ok: true };
}

export async function updateTeam(teamId: string, name: string, managerId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name, manager_id: managerId }).eq("id", teamId);
  if (error) return { ok: false, error: "Modification impossible." };

  await logAudit({ action: "team_updated", entityType: "team", entityId: teamId, newValue: { name, managerId } });
  revalidatePath("/admin/teams");
  return { ok: true };
}
