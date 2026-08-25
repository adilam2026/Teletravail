"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";

function revalidateOrgViews() {
  revalidatePath("/admin/organisation");
  revalidatePath("/admin/users");
  revalidatePath("/squad/team");
  revalidatePath("/tribe/overview");
  revalidatePath("/du/overview");
}

export async function createOrganizationalUnit(name: string, managerId: string | null): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizational_units").insert({ name, manager_id: managerId, created_by: profile.id }).select("id").single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "organizational_unit_created", entityType: "organizational_unit", entityId: data.id, newValue: { name, managerId } });
  revalidateOrgViews();
  return { ok: true };
}

export async function updateOrganizationalUnit(id: string, name: string, managerId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("organizational_units").update({ name, manager_id: managerId }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

  await logAudit({ action: "organizational_unit_updated", entityType: "organizational_unit", entityId: id, newValue: { name, managerId } });
  revalidateOrgViews();
  return { ok: true };
}

export async function createTribe(name: string, organizationalUnitId: string, managerId: string | null): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tribes")
    .insert({ name, organizational_unit_id: organizationalUnitId, manager_id: managerId, created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "tribe_created", entityType: "tribe", entityId: data.id, newValue: { name, organizationalUnitId, managerId } });
  revalidateOrgViews();
  return { ok: true };
}

export async function updateTribe(id: string, name: string, managerId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("tribes").update({ name, manager_id: managerId }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

  await logAudit({ action: "tribe_updated", entityType: "tribe", entityId: id, newValue: { name, managerId } });
  revalidateOrgViews();
  return { ok: true };
}

export async function createSquad(name: string, tribeId: string, managerId: string | null): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("squads").insert({ name, tribe_id: tribeId, manager_id: managerId, created_by: profile.id }).select("id").single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "squad_created", entityType: "squad", entityId: data.id, newValue: { name, tribeId, managerId } });
  revalidateOrgViews();
  return { ok: true };
}

export async function updateSquad(id: string, name: string, managerId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("squads").update({ name, manager_id: managerId }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

  await logAudit({ action: "squad_updated", entityType: "squad", entityId: id, newValue: { name, managerId } });
  revalidateOrgViews();
  return { ok: true };
}
