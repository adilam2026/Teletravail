"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";

export interface AbsenceInput {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  comment?: string;
}

export async function createAbsence(input: AbsenceInput): Promise<ActionResult> {
  const { profile } = await requireUser();
  if (profile.role !== "admin" && profile.role !== "manager") return { ok: false, error: "Non autorisé." };
  if (input.endDate < input.startDate) return { ok: false, error: "La date de fin doit suivre la date de début." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absences")
    .insert({
      employee_id: input.employeeId,
      absence_type_id: input.absenceTypeId,
      start_date: input.startDate,
      end_date: input.endDate,
      comment: input.comment ?? null,
      source: profile.role === "admin" ? "admin" : "manager",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible (collaborateur hors de votre équipe ?)." };

  await logAudit({ action: "absence_created", entityType: "absence", entityId: data.id, newValue: input });
  revalidatePath("/manager/absences");
  revalidatePath("/admin/absences");
  revalidatePath("/employee/absences");
  return { ok: true };
}

export async function setAbsenceTypeTriggersReturnRule(id: string, triggersReturnRule: boolean): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("absence_types").update({ triggers_return_rule: triggersReturnRule }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

  await logAudit({ action: "absence_type_updated", entityType: "absence_type", entityId: id, newValue: { triggersReturnRule } });
  revalidatePath("/admin/rules");
  return { ok: true };
}

export async function deleteAbsence(id: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };

  await logAudit({ action: "absence_deleted", entityType: "absence", entityId: id });
  revalidatePath("/manager/absences");
  revalidatePath("/admin/absences");
  return { ok: true };
}
