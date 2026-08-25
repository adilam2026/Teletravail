"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { loadEmployeeWeek } from "@/lib/data/planning";
import { getDirectValidatorId } from "@/lib/data/hierarchy";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/lib/actions/account";

const EDITABLE_STATUSES = ["draft", "needs_changes"];
const VALIDATION_PATHS = ["/squad/validation", "/squad/team", "/tribe/validation", "/tribe/overview", "/du/validation", "/du/overview"];

function revalidateValidationViews() {
  for (const path of VALIDATION_PATHS) revalidatePath(path);
}

/**
 * Bascule un jour en télétravail / retour bureau, en revalidant toutes les
 * règles côté serveur. `replaceDate`, quand fourni, retire ce jour déjà
 * sélectionné dans le même mouvement — remplacement intelligent quand le
 * quota est atteint (section 7-8) : le client choisit ou déduit ce paramètre
 * à partir de `swapCandidates` renvoyé par le moteur de règles.
 */
export async function toggleTeleworkDay(weekStart: string, date: string, replaceDate?: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const week = await loadEmployeeWeek(supabase, profile, weekStart);
  if (!EDITABLE_STATUSES.includes(week.plan.status)) {
    return { ok: false, error: "Cette semaine est verrouillée et ne peut plus être modifiée." };
  }

  const isSelected = week.selectedDates.includes(date);

  if (isSelected) {
    const { error } = await supabase
      .from("telework_days")
      .delete()
      .eq("weekly_plan_id", week.plan.id)
      .eq("work_date", date);
    if (error) return { ok: false, error: "Impossible de retirer ce jour." };
    revalidatePath("/employee/agenda");
    revalidatePath("/employee/weeks");
    return { ok: true };
  }

  const day = week.result.days.find((d) => d.date === date);
  if (!day) return { ok: false, error: "Jour invalide." };

  if (!day.allowed) {
    if (day.swapCandidates && day.swapCandidates.length > 0) {
      const target = replaceDate ?? (day.swapCandidates.length === 1 ? day.swapCandidates[0] : undefined);
      if (!target || !day.swapCandidates.includes(target)) {
        return { ok: false, error: "Choisissez le jour à remplacer." };
      }
      const { error: deleteError } = await supabase
        .from("telework_days")
        .delete()
        .eq("weekly_plan_id", week.plan.id)
        .eq("work_date", target);
      if (deleteError) return { ok: false, error: "Impossible de libérer le jour à remplacer." };

      const { error: insertError } = await supabase
        .from("telework_days")
        .insert({ weekly_plan_id: week.plan.id, work_date: date });
      if (insertError) return { ok: false, error: "Impossible d'ajouter ce jour." };

      revalidatePath("/employee/agenda");
      revalidatePath("/employee/weeks");
      return { ok: true };
    }
    return { ok: false, error: day.reason ?? "Ce jour n'est pas disponible pour le télétravail." };
  }

  const { error } = await supabase.from("telework_days").insert({ weekly_plan_id: week.plan.id, work_date: date });
  if (error) return { ok: false, error: "Impossible d'ajouter ce jour." };

  revalidatePath("/employee/agenda");
  revalidatePath("/employee/weeks");
  return { ok: true };
}

export async function submitWeek(weekStart: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const week = await loadEmployeeWeek(supabase, profile, weekStart);
  if (!EDITABLE_STATUSES.includes(week.plan.status)) {
    return { ok: false, error: "Cette semaine est déjà soumise ou verrouillée." };
  }
  if (!week.result.canSubmit) {
    const blocking = week.result.alerts.find((a) => a.severity === "blocking");
    return { ok: false, error: blocking?.message ?? "Des règles ne sont pas respectées." };
  }
  if (week.result.selectedCount === 0) {
    return { ok: false, error: "Sélectionnez au moins un jour avant de soumettre, ou laissez la semaine en brouillon." };
  }

  const { error } = await supabase
    .from("weekly_plans")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", week.plan.id);
  if (error) return { ok: false, error: "Impossible de soumettre la semaine." };

  await logAudit({
    action: "week_submitted",
    entityType: "weekly_plan",
    entityId: week.plan.id,
    newValue: { status: "submitted", selectedDates: week.selectedDates },
  });

  if (profile.role === "du_head") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "du_head_auto_validate").maybeSingle();
    if (setting?.value === true) {
      await supabase
        .from("weekly_plans")
        .update({ status: "validated", decided_at: new Date().toISOString() })
        .eq("id", week.plan.id);
      await logAudit({ action: "week_validated", entityType: "weekly_plan", entityId: week.plan.id, newValue: { status: "validated", auto: true } });
    } else {
      const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").eq("status", "active");
      for (const admin of admins ?? []) {
        await notify(supabase, {
          recipientId: admin.id,
          type: "week_to_validate",
          title: `${profile.first_name} ${profile.last_name} (Responsable DU) a soumis sa semaine`,
          body: `Semaine du ${weekStart} en attente de validation.`,
          relatedEntityType: "weekly_plan",
          relatedEntityId: week.plan.id,
        });
      }
    }
  } else {
    const validatorId = await getDirectValidatorId(supabase, profile);
    if (validatorId) {
      await notify(supabase, {
        recipientId: validatorId,
        type: "week_to_validate",
        title: `${profile.first_name} ${profile.last_name} a soumis sa semaine`,
        body: `Semaine du ${weekStart} en attente de validation.`,
        relatedEntityType: "weekly_plan",
        relatedEntityId: week.plan.id,
      });
    }
  }

  revalidatePath("/employee/agenda");
  revalidatePath("/employee/weeks");
  revalidateValidationViews();
  return { ok: true };
}

/**
 * Le collaborateur rappelle sa propre semaine tant qu'elle est seulement
 * "soumise" (en attente de décision) : contrairement à la réouverture d'une
 * semaine déjà validée, aucune approbation du validateur n'est nécessaire
 * ici puisque rien n'a encore été décidé — la semaine repasse simplement en
 * brouillon, modifiable.
 */
export async function recallWeek(planId: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
  if (!plan || plan.employee_id !== profile.id) return { ok: false, error: "Semaine introuvable." };
  if (plan.status !== "submitted") return { ok: false, error: "Seule une semaine en attente de validation peut être rappelée." };

  const { error } = await supabase
    .from("weekly_plans")
    .update({ status: "draft", submitted_at: null })
    .eq("id", planId);
  if (error) return { ok: false, error: "Rappel impossible." };

  await logAudit({ action: "week_recalled", entityType: "weekly_plan", entityId: planId, oldValue: { status: "submitted" }, newValue: { status: "draft" } });

  revalidatePath("/employee/agenda");
  revalidatePath("/employee/weeks");
  revalidateValidationViews();
  return { ok: true };
}

async function decideWeek(
  planId: string,
  newStatus: "validated" | "rejected" | "needs_changes",
  comment: string | null
): Promise<ActionResult> {
  const { profile: validator } = await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
  if (!plan) return { ok: false, error: "Semaine introuvable." };
  if (plan.status !== "submitted") return { ok: false, error: "Cette semaine n'est pas en attente de validation." };

  const { error } = await supabase
    .from("weekly_plans")
    .update({
      status: newStatus,
      decided_at: new Date().toISOString(),
      decided_by: validator.id,
      manager_comment: comment,
    })
    .eq("id", planId);
  if (error) return { ok: false, error: "Action impossible : cette semaine n'est pas dans votre périmètre de validation." };

  await logAudit({
    action: `week_${newStatus}`,
    entityType: "weekly_plan",
    entityId: planId,
    oldValue: { status: "submitted" },
    newValue: { status: newStatus, comment },
  });

  const label = newStatus === "validated" ? "validée" : newStatus === "rejected" ? "refusée" : "à modifier";
  await notify(supabase, {
    recipientId: plan.employee_id,
    type: `week_${newStatus}`,
    title: `Votre semaine a été ${label}`,
    body: comment ?? undefined,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  revalidateValidationViews();
  return { ok: true };
}

export async function validateWeek(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "validated", comment ?? null);
}

export async function rejectWeek(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "rejected", comment ?? null);
}

export async function requestWeekChanges(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "needs_changes", comment ?? null);
}

export async function validateWeeksInBulk(planIds: string[]): Promise<ActionResult> {
  const results = await Promise.all(planIds.map((id) => decideWeek(id, "validated", null)));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    return { ok: false, error: `${failed.length} semaine(s) n'ont pas pu être validées.` };
  }
  return { ok: true };
}

/** Le collaborateur demande la réouverture d'une semaine déjà validée. */
export async function requestWeekReopen(planId: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
  if (!plan || plan.employee_id !== profile.id) return { ok: false, error: "Semaine introuvable." };
  if (plan.status !== "validated") return { ok: false, error: "Seule une semaine validée peut faire l'objet d'une demande de modification." };

  const validatorId = await getDirectValidatorId(supabase, profile);
  if (!validatorId) return { ok: false, error: "Aucun validateur rattaché à ce compte." };

  await notify(supabase, {
    recipientId: validatorId,
    type: "reopen_requested",
    title: `${profile.first_name} ${profile.last_name} demande la réouverture d'une semaine`,
    body: `Semaine du ${plan.week_start}, actuellement validée.`,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  await logAudit({ action: "week_reopen_requested", entityType: "weekly_plan", entityId: planId });
  return { ok: true };
}

/** Le validateur accepte la réouverture : la semaine repasse "à modifier", l'ancien état est conservé dans l'historique. */
export async function approveWeekReopen(planId: string, comment?: string): Promise<ActionResult> {
  const { profile: validator } = await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
  if (!plan) return { ok: false, error: "Semaine introuvable." };
  if (plan.status !== "validated") return { ok: false, error: "Cette semaine n'est pas validée." };

  const { data: previousDays } = await supabase.from("telework_days").select("work_date").eq("weekly_plan_id", planId);

  const { error } = await supabase
    .from("weekly_plans")
    .update({
      status: "needs_changes",
      decided_at: new Date().toISOString(),
      decided_by: validator.id,
      manager_comment: comment ?? "Réouverture acceptée.",
    })
    .eq("id", planId);
  if (error) return { ok: false, error: "Action impossible : cette semaine n'est pas dans votre périmètre." };

  await logAudit({
    action: "week_reopen_approved",
    entityType: "weekly_plan",
    entityId: planId,
    oldValue: { status: "validated", days: previousDays },
    newValue: { status: "needs_changes" },
  });

  await notify(supabase, {
    recipientId: plan.employee_id,
    type: "week_needs_changes",
    title: "Votre demande de modification a été acceptée",
    body: `Vous pouvez à nouveau modifier la semaine du ${plan.week_start}.`,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  revalidateValidationViews();
  return { ok: true };
}
