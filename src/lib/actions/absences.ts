"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";
import type { AbsenceRow } from "@/lib/supabase/database.types";

export interface AbsenceInput {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  comment?: string;
}

function revalidateAbsenceViews() {
  revalidatePath("/squad/absences");
  revalidatePath("/tribe/absences");
  revalidatePath("/du/absences");
  revalidatePath("/admin/absences");
  revalidatePath("/employee/absences");
  revalidatePath("/employee/agenda");
}

/**
 * Déclare une absence — pour soi-même (self-service, section 10) ou, pour un
 * niveau hiérarchique supérieur, pour l'un de ses rattachés. RLS reste
 * l'autorité finale (périmètre exact, fenêtre "future uniquement" pour le
 * self-service) : ce contrôle applicatif ne fait qu'éviter un message
 * d'erreur générique quand la demande est manifestement hors périmètre.
 */
export async function createAbsence(input: AbsenceInput): Promise<ActionResult> {
  const { profile } = await requireUser();
  if (input.endDate < input.startDate) return { ok: false, error: "La date de fin doit suivre la date de début." };

  const isSelf = input.employeeId === profile.id;
  if (!isSelf && profile.role === "employee") {
    return { ok: false, error: "Vous ne pouvez déclarer une absence que pour vous-même." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absences")
    .insert({
      employee_id: input.employeeId,
      absence_type_id: input.absenceTypeId,
      start_date: input.startDate,
      end_date: input.endDate,
      comment: input.comment ?? null,
      source: isSelf ? "employee" : profile.role === "admin" ? "admin" : "hierarchy",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible (hors de votre périmètre ?)." };

  await logAudit({ action: "absence_created", entityType: "absence", entityId: data.id, newValue: input });
  revalidateAbsenceViews();
  return { ok: true };
}

export interface UpdateAbsenceInput {
  id: string;
  absenceTypeId?: string;
  startDate?: string;
  endDate?: string;
  comment?: string | null;
}

/** Modifie une absence — uniquement si elle est future (les absences passées sont figées, section 14). */
export async function updateAbsence(input: UpdateAbsenceInput): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const patch: Partial<AbsenceRow> = {};
  if (input.absenceTypeId !== undefined) patch.absence_type_id = input.absenceTypeId;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.comment !== undefined) patch.comment = input.comment;

  const { data: before } = await supabase.from("absences").select("*").eq("id", input.id).maybeSingle();
  const { error } = await supabase.from("absences").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: "Modification impossible (absence passée ou hors de votre périmètre)." };

  await logAudit({ action: "absence_updated", entityType: "absence", entityId: input.id, oldValue: before, newValue: patch });
  revalidateAbsenceViews();
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
  if (error) return { ok: false, error: "Suppression impossible (absence passée ou hors de votre périmètre)." };

  await logAudit({ action: "absence_deleted", entityType: "absence", entityId: id });
  revalidateAbsenceViews();
  return { ok: true };
}
