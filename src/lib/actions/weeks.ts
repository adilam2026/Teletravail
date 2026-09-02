"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { loadEmployeeWeek } from "@/lib/data/planning";
import { getDirectValidatorId, resolveTargetProfile } from "@/lib/data/hierarchy";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { perfTime } from "@/lib/perf";
import type { ActionResult } from "@/lib/actions/account";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { PlanStatus, ProfileRow, WeeklyPlanVersionDecisionCode } from "@/lib/supabase/database.types";

const SELF_EDITABLE_STATUSES: PlanStatus[] = ["draft", "needs_changes"];
const DELEGATE_EDITABLE_STATUSES: PlanStatus[] = ["draft", "needs_changes", "submitted"];
const VALIDATION_PATHS = ["/squad/validation", "/squad/team", "/tribe/validation", "/tribe/overview", "/du/validation", "/du/overview"];

function revalidateValidationViews() {
  for (const path of VALIDATION_PATHS) revalidatePath(path);
}

function revalidateWeekViews() {
  revalidatePath("/employee/agenda");
  revalidatePath("/employee/planning");
  revalidateValidationViews();
}

/**
 * Journal détaillé du cycle de vie d'une semaine (section 11-12 du cahier
 * des charges) : distinct du `audit_logs` générique, dédié à reconstruire une
 * timeline lisible. Ne doit jamais faire échouer l'action métier : un souci
 * d'écriture du journal n'empêche pas l'opération réelle d'avoir eu lieu.
 */
async function logPlanEvent(
  supabase: AppSupabaseClient,
  params: {
    weeklyPlanId: string;
    versionNumber?: number | null;
    eventType: string;
    actor: ProfileRow;
    statusBefore?: PlanStatus | null;
    statusAfter?: PlanStatus | null;
    daysBefore?: string[] | null;
    daysAfter?: string[] | null;
    comment?: string | null;
  }
): Promise<void> {
  await supabase.from("weekly_plan_events").insert({
    weekly_plan_id: params.weeklyPlanId,
    version_number: params.versionNumber ?? null,
    event_type: params.eventType,
    actor_id: params.actor.id,
    actor_role: params.actor.role,
    status_before: params.statusBefore ?? null,
    status_after: params.statusAfter ?? null,
    days_before: params.daysBefore ?? null,
    days_after: params.daysAfter ?? null,
    comment: params.comment ?? null,
  });
}

async function currentSelectedDates(supabase: AppSupabaseClient, planId: string): Promise<string[]> {
  const { data } = await supabase.from("telework_days").select("work_date").eq("weekly_plan_id", planId);
  return (data ?? []).map((d) => d.work_date).sort();
}

/**
 * Bascule un jour en télétravail / retour bureau, en revalidant toutes les
 * règles côté serveur. `replaceDate`, quand fourni, retire ce jour déjà
 * sélectionné dans le même mouvement — remplacement intelligent quand le
 * quota est atteint. `targetEmployeeId`, quand fourni et différent de
 * l'acteur, permet à un supérieur de préparer/ajuster la semaine d'un
 * rattaché (section 14-19) — la RLS reste l'autorité finale sur le
 * périmètre autorisé, ce code ne fait que réagir proprement à un refus.
 */
export async function toggleTeleworkDay(
  weekStart: string,
  date: string,
  replaceDate?: string,
  targetEmployeeId?: string
): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { profile: target, isActingOnBehalf } = await resolveTargetProfile(supabase, actor, targetEmployeeId);
  if (!target) return { ok: false, error: "Collaborateur introuvable ou hors de votre périmètre." };

  const week = await loadEmployeeWeek(supabase, target, weekStart);
  const editableStatuses = isActingOnBehalf ? DELEGATE_EDITABLE_STATUSES : SELF_EDITABLE_STATUSES;
  if (!editableStatuses.includes(week.plan.status)) {
    return { ok: false, error: "Cette semaine est verrouillée et ne peut plus être modifiée." };
  }

  const before = week.selectedDates.slice().sort();
  const isSelected = week.selectedDates.includes(date);

  async function finish(eventType: string): Promise<ActionResult> {
    const after = await currentSelectedDates(supabase, week.plan.id);
    await logPlanEvent(supabase, {
      weeklyPlanId: week.plan.id,
      eventType: isActingOnBehalf ? "modified_by_manager" : eventType,
      actor,
      daysBefore: before,
      daysAfter: after,
    });
    revalidatePath("/employee/agenda");
    revalidatePath("/employee/planning");
    if (isActingOnBehalf) revalidateValidationViews();
    return { ok: true };
  }

  if (isSelected) {
    const { error } = await supabase.from("telework_days").delete().eq("weekly_plan_id", week.plan.id).eq("work_date", date);
    if (error) return { ok: false, error: "Impossible de retirer ce jour." };
    return finish("day_removed");
  }

  const day = week.result.days.find((d) => d.date === date);
  if (!day) return { ok: false, error: "Jour invalide." };

  if (!day.allowed) {
    if (day.swapCandidates && day.swapCandidates.length > 0) {
      const swapTarget = replaceDate ?? (day.swapCandidates.length === 1 ? day.swapCandidates[0] : undefined);
      if (!swapTarget || !day.swapCandidates.includes(swapTarget)) {
        return { ok: false, error: "Choisissez le jour à remplacer." };
      }
      const { error: deleteError } = await supabase
        .from("telework_days")
        .delete()
        .eq("weekly_plan_id", week.plan.id)
        .eq("work_date", swapTarget);
      if (deleteError) return { ok: false, error: "Impossible de libérer le jour à remplacer." };

      const { error: insertError } = await supabase.from("telework_days").insert({ weekly_plan_id: week.plan.id, work_date: date });
      if (insertError) return { ok: false, error: "Impossible d'ajouter ce jour." };

      return finish("day_replaced");
    }
    return { ok: false, error: day.reason ?? "Ce jour n'est pas disponible pour le télétravail." };
  }

  const { error } = await supabase.from("telework_days").insert({ weekly_plan_id: week.plan.id, work_date: date });
  if (error) return { ok: false, error: "Impossible d'ajouter ce jour." };
  return finish("day_added");
}

export async function submitWeek(weekStart: string, targetEmployeeId?: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { profile: target, isActingOnBehalf } = await resolveTargetProfile(supabase, actor, targetEmployeeId);
  if (!target) return { ok: false, error: "Collaborateur introuvable ou hors de votre périmètre." };

  const week = await loadEmployeeWeek(supabase, target, weekStart);
  const editableStatuses = isActingOnBehalf ? DELEGATE_EDITABLE_STATUSES.filter((s) => s !== "submitted") : SELF_EDITABLE_STATUSES;
  if (!editableStatuses.includes(week.plan.status)) {
    return { ok: false, error: "Cette semaine est déjà soumise ou verrouillée." };
  }
  if (!week.result.canSubmit) {
    const blocking = week.result.alerts.find((a) => a.severity === "blocking");
    return { ok: false, error: blocking?.message ?? "Des règles ne sont pas respectées." };
  }
  if (week.result.selectedCount === 0) {
    return { ok: false, error: "Sélectionnez au moins un jour avant de soumettre, ou laissez la semaine en brouillon." };
  }

  // Une seule transaction serveur (update statut + version + jours de
  // version + événement + audit log) au lieu d'une dizaine d'allers-retours
  // séquentiels — section 19-20 du cahier des charges perf.
  const { data: updated, error } = await perfTime("submit_week RPC", () =>
    supabase.rpc("submit_week", { p_plan_id: week.plan.id, p_selected_dates: week.selectedDates })
  );
  if (error || !updated) return { ok: false, error: "Impossible de soumettre la semaine." };

  if (target.role === "du_head") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "du_head_auto_validate").maybeSingle();
    if (setting?.value === true) {
      // Même opération qu'un "Valider" manuel (decide_week), déclenchée
      // automatiquement plutôt que par un clic — un seul aller-retour ici aussi.
      await supabase.rpc("decide_week", {
        p_plan_id: week.plan.id,
        p_decision: "validated",
        p_comment: "Validation automatique (Responsable DU).",
      });
    } else {
      const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").eq("status", "active");
      for (const admin of admins ?? []) {
        await notify(supabase, {
          recipientId: admin.id,
          type: "week_to_validate",
          title: `${target.first_name} ${target.last_name} (Responsable DU) a soumis sa semaine`,
          body: `Semaine du ${weekStart} en attente de validation.`,
          relatedEntityType: "weekly_plan",
          relatedEntityId: week.plan.id,
        });
      }
    }
  } else {
    const validatorId = await getDirectValidatorId(supabase, target);
    if (validatorId) {
      await notify(supabase, {
        recipientId: validatorId,
        type: "week_to_validate",
        title: isActingOnBehalf
          ? `${actor.first_name} ${actor.last_name} a soumis la semaine de ${target.first_name} ${target.last_name}`
          : `${target.first_name} ${target.last_name} a soumis sa semaine`,
        body: `Semaine du ${weekStart} en attente de validation.`,
        relatedEntityType: "weekly_plan",
        relatedEntityId: week.plan.id,
      });
    }
  }

  revalidateWeekViews();
  return { ok: true };
}

/**
 * Le collaborateur rappelle sa propre semaine tant qu'elle est seulement
 * "soumise" (en attente de décision) : contrairement à la réouverture d'une
 * semaine déjà validée, aucune approbation du validateur n'est nécessaire —
 * la semaine repasse en brouillon, modifiable, sélection conservée.
 * Transition vérifiée de façon atomique (UPDATE ... WHERE status =
 * 'submitted') pour trancher proprement une course avec une décision
 * manager simultanée : une seule des deux opérations peut réussir.
 */
export async function recallWeek(planId: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  // Update + événement + audit log en une seule transaction serveur (un
  // aller-retour au lieu de ~5) — section 19-20 du cahier des charges perf.
  // L'appartenance (employee_id = auteur) est vérifiée dans la fonction
  // elle-même, plus besoin d'une lecture préalable pour ce cas.
  const { data: updated, error } = await perfTime("recall_week RPC", () => supabase.rpc("recall_week", { p_plan_id: planId }));

  // NO_MATCH : la fonction n'a trouvé aucune ligne à mettre à jour (mauvais
  // propriétaire, ou statut déjà différent de "submitted") — on affine le
  // message avec une lecture de diagnostic, comme avant. Toute autre erreur
  // est une vraie panne.
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Rappel impossible." };

  if (!updated) {
    const { data: current } = await supabase.from("weekly_plans").select("employee_id, status").eq("id", planId).maybeSingle();
    if (!current || current.employee_id !== profile.id) return { ok: false, error: "Semaine introuvable." };
    if (current.status === "draft") return { ok: false, error: "Cette semaine est déjà en brouillon." };
    if (current.status === "needs_changes" || current.status === "validated") {
      return { ok: false, error: "Cette semaine vient d'être traitée par votre manager. Actualisation du statut..." };
    }
    return { ok: false, error: "Rappel impossible." };
  }

  revalidateWeekViews();
  return { ok: true };
}

/**
 * Décision du validateur sur une semaine soumise. "rejected" et
 * "changes_requested" (Refuser / Demander modification) produisent le même
 * état vivant "À modifier" — le collaborateur récupère la main dans les
 * deux cas (section 13) — seule la nature exacte de la décision diffère,
 * conservée sur la version pour l'historique ("Version 1 -> Refusée").
 * Transition atomique, même principe que `recallWeek`.
 */
async function decideWeek(planId: string, decision: WeeklyPlanVersionDecisionCode, comment: string | null): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  // Update + décision de version + événement + audit log en une seule
  // transaction serveur (un aller-retour au lieu de ~6) — section 19-20.
  const { data: updated, error } = await perfTime("decide_week RPC", () =>
    supabase.rpc("decide_week", { p_plan_id: planId, p_decision: decision, p_comment: comment })
  );

  if (error && error.message !== "NO_MATCH") {
    return { ok: false, error: "Action impossible : cette semaine n'est pas dans votre périmètre de validation." };
  }

  if (!updated) {
    const { data: current } = await supabase.from("weekly_plans").select("status").eq("id", planId).maybeSingle();
    if (current?.status === "draft") return { ok: false, error: "Le collaborateur vient de rappeler cette demande. Actualisation du statut..." };
    if (current?.status === "validated" || current?.status === "needs_changes") {
      return { ok: false, error: "Cette semaine vient d'être traitée. Actualisation du statut..." };
    }
    return { ok: false, error: "Cette semaine n'est pas en attente de validation." };
  }

  const label = decision === "validated" ? "validée" : "renvoyée pour modification";
  await notify(supabase, {
    recipientId: updated.employee_id,
    type: decision === "validated" ? "week_validated" : "week_needs_changes",
    title: `Votre semaine a été ${label}`,
    body: comment ?? undefined,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  revalidateValidationViews();
  revalidatePath("/employee/agenda");
  return { ok: true };
}

export async function validateWeek(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "validated", comment ?? null);
}

export async function rejectWeek(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "rejected", comment ?? null);
}

export async function requestWeekChanges(planId: string, comment?: string): Promise<ActionResult> {
  return decideWeek(planId, "changes_requested", comment ?? null);
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

  await logPlanEvent(supabase, { weeklyPlanId: planId, eventType: "reopen_requested", actor: profile, statusBefore: "validated", statusAfter: "validated" });
  await logAudit({ action: "week_reopen_requested", entityType: "weekly_plan", entityId: planId });
  return { ok: true };
}

/** Le validateur accepte la réouverture : la semaine repasse "à modifier", l'ancien état est conservé dans l'historique. */
export async function approveWeekReopen(planId: string, comment?: string): Promise<ActionResult> {
  const { profile: validator } = await requireUser();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("weekly_plans")
    .update({
      status: "needs_changes",
      decided_at: new Date().toISOString(),
      decided_by: validator.id,
      manager_comment: comment ?? "Réouverture acceptée.",
    })
    .eq("id", planId)
    .eq("status", "validated")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: "Action impossible : cette semaine n'est pas dans votre périmètre." };
  if (!updated) return { ok: false, error: "Cette semaine n'est plus validée." };

  const dates = await currentSelectedDates(supabase, planId);
  await logPlanEvent(supabase, {
    weeklyPlanId: planId,
    eventType: "reopen_approved",
    actor: validator,
    statusBefore: "validated",
    statusAfter: "needs_changes",
    daysBefore: dates,
    daysAfter: dates,
    comment: comment ?? "Réouverture acceptée.",
  });
  await logAudit({
    action: "week_reopen_approved",
    entityType: "weekly_plan",
    entityId: planId,
    oldValue: { status: "validated" },
    newValue: { status: "needs_changes" },
  });

  await notify(supabase, {
    recipientId: updated.employee_id,
    type: "week_needs_changes",
    title: "Votre demande de modification a été acceptée",
    body: `Vous pouvez à nouveau modifier la semaine du ${updated.week_start}.`,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  revalidateValidationViews();
  return { ok: true };
}
