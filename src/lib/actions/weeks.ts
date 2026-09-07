"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { loadEmployeeWeek } from "@/lib/data/planning";
import { mondayOf } from "@/lib/date/casablanca";
import { addDaysStr } from "@/lib/rules-engine/calendar";
import { getDirectValidatorId, resolveTargetProfile } from "@/lib/data/hierarchy";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { perfTime } from "@/lib/perf";
import type { ActionResult } from "@/lib/actions/account";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { PlanStatus, ProfileRow, WeeklyPlanVersionDecisionCode } from "@/lib/supabase/database.types";
import type { WeekEvaluationInput } from "@/lib/rules-engine/types";
import type { DayBadge } from "@/lib/data/planning";

const SELF_EDITABLE_STATUSES: PlanStatus[] = ["draft", "needs_changes"];
// "validated" y figure pour le seul cas d'un supérieur qui régularise
// lui-même une semaine déjà validée (section 2 "saisie manager") — jamais
// pour le collaborateur, qui reste bloqué tant qu'il n'a pas obtenu une
// réouverture (SELF_EDITABLE_STATUSES ne l'inclut pas).
const DELEGATE_EDITABLE_STATUSES: PlanStatus[] = ["draft", "needs_changes", "submitted", "validated"];
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

export interface EditableWeekResult {
  ok: true;
  planId: string;
  status: PlanStatus;
  evaluationInput: WeekEvaluationInput;
  badges: Record<string, DayBadge | null>;
}

/**
 * Chargé à la demande uniquement quand le manager clique "Modifier" sur une
 * ligne du planning équipe (section 24 perf : jamais préchargé pour chaque
 * collaborateur affiché) — réutilise `loadEmployeeWeek` telle quelle, donc
 * exactement les mêmes règles (quota, jours consécutifs, veille/reprise
 * d'absence...) que "Saisie télétravail" collaborateur.
 */
export async function getEditableWeek(targetEmployeeId: string, weekStart: string): Promise<EditableWeekResult | { ok: false; error: string }> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { profile: target, isActingOnBehalf } = await resolveTargetProfile(supabase, actor, targetEmployeeId);
  if (!target || !isActingOnBehalf) return { ok: false, error: "Collaborateur introuvable ou hors de votre périmètre." };

  const week = await loadEmployeeWeek(supabase, target, weekStart);
  if (!DELEGATE_EDITABLE_STATUSES.includes(week.plan.status)) {
    return { ok: false, error: "Cette semaine ne peut pas être modifiée." };
  }
  return { ok: true, planId: week.plan.id, status: week.plan.status, evaluationInput: week.evaluationInput, badges: week.badges };
}

export async function submitWeek(weekStart: string, targetEmployeeId?: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { profile: target, isActingOnBehalf } = await resolveTargetProfile(supabase, actor, targetEmployeeId);
  if (!target) return { ok: false, error: "Collaborateur introuvable ou hors de votre périmètre." };

  const week = await loadEmployeeWeek(supabase, target, weekStart);
  // "submitted" et "validated" en sont exclus : on ne "soumet" jamais une
  // semaine déjà soumise, et un supérieur qui régularise une semaine validée
  // passe par `managerValidateNow` (validation directe), jamais par une
  // resoumission.
  const editableStatuses: PlanStatus[] = isActingOnBehalf ? ["draft", "needs_changes"] : SELF_EDITABLE_STATUSES;
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

/**
 * Le collaborateur demande la réouverture d'une semaine déjà validée — une
 * vraie ligne persistante (`week_reopen_requests`), exploitable directement
 * par le manager depuis son planning consolidé (section 1 du cahier des
 * charges "demande de modification d'une semaine déjà validée" : l'ancien
 * comportement se contentait d'un événement de journal + une notification,
 * sans rien de directement actionnable côté manager).
 */
export async function requestWeekReopen(planId: string, reason?: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
  if (!plan || plan.employee_id !== profile.id) return { ok: false, error: "Semaine introuvable." };
  if (plan.status !== "validated") return { ok: false, error: "Seule une semaine validée peut faire l'objet d'une demande de modification." };

  const { error } = await supabase.from("week_reopen_requests").insert({
    weekly_plan_id: planId,
    employee_id: profile.id,
    requested_by: profile.id,
    reason: reason?.trim() || null,
  });
  // Contrainte unique "une seule demande en attente par semaine" : un
  // double-clic ne doit jamais faire échouer l'action aux yeux du
  // collaborateur, la demande active existe déjà.
  if (error && error.code !== "23505") return { ok: false, error: "Demande impossible." };

  const validatorId = await getDirectValidatorId(supabase, profile);
  if (validatorId) {
    await notify(supabase, {
      recipientId: validatorId,
      type: "reopen_requested",
      title: `${profile.first_name} ${profile.last_name} demande la réouverture d'une semaine`,
      body: `Semaine du ${plan.week_start}, actuellement validée.`,
      relatedEntityType: "weekly_plan",
      relatedEntityId: planId,
    });
  }

  await logPlanEvent(supabase, {
    weeklyPlanId: planId,
    eventType: "reopen_requested",
    actor: profile,
    statusBefore: "validated",
    statusAfter: "validated",
    comment: reason?.trim() || null,
  });
  await logAudit({ action: "week_reopen_requested", entityType: "weekly_plan", entityId: planId, newValue: { reason: reason ?? null } });
  revalidateWeekViews();
  return { ok: true };
}

/**
 * Décision du manager sur une demande de réouverture — RPC atomique unique
 * (décision + transition de la semaine si acceptée + historique + audit),
 * jamais de "router.refresh()" ni de suite d'allers-retours (section 15
 * perf). `approve=false` (Refuser) laisse la semaine validée telle quelle.
 */
export async function decideReopenRequest(requestId: string, approve: boolean, comment?: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: updated, error } = await perfTime("decide_reopen_request RPC", () =>
    supabase.rpc("decide_reopen_request", { p_request_id: requestId, p_approve: approve, p_comment: comment?.trim() || null })
  );
  if (error && error.message !== "NO_MATCH") {
    return { ok: false, error: "Action impossible : cette demande n'est pas dans votre périmètre." };
  }
  if (!updated) return { ok: false, error: "Cette demande a déjà été traitée." };

  const { data: plan } = await supabase.from("weekly_plans").select("employee_id, week_start").eq("id", updated.weekly_plan_id).maybeSingle();
  if (plan) {
    await notify(supabase, {
      recipientId: plan.employee_id,
      type: approve ? "week_needs_changes" : "reopen_rejected",
      title: approve ? "Votre demande de modification a été acceptée" : "Votre demande de modification a été refusée",
      body: approve
        ? `Vous pouvez à nouveau modifier la semaine du ${plan.week_start}.`
        : `La semaine du ${plan.week_start} reste validée.`,
      relatedEntityType: "weekly_plan",
      relatedEntityId: updated.weekly_plan_id,
    });
  }

  revalidateValidationViews();
  revalidatePath("/employee/agenda");
  return { ok: true };
}

/**
 * Saisie manager "Enregistrer et valider" (section 2 du cahier des charges) :
 * le manager a déjà ajusté les jours via `toggleTeleworkDay` (même mécanisme
 * optimiste que le collaborateur, RLS étendue pour couvrir aussi une semaine
 * déjà validée) — cette action ne fait que valider directement l'état
 * courant, depuis n'importe quel statut de départ, en un seul aller-retour
 * RPC. Jamais de "manager soumet -> manager valide sa propre soumission".
 */
export async function managerValidateNow(planId: string, targetEmployeeId: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { profile: target } = await resolveTargetProfile(supabase, actor, targetEmployeeId);
  if (!target) return { ok: false, error: "Collaborateur introuvable ou hors de votre périmètre." };

  const { data: updated, error } = await perfTime("manager_validate_week RPC", () =>
    supabase.rpc("manager_validate_week", { p_plan_id: planId })
  );
  if (error && error.message !== "NO_MATCH") {
    return { ok: false, error: "Action impossible : ce collaborateur n'est pas dans votre périmètre." };
  }
  if (!updated) return { ok: false, error: "Semaine introuvable." };

  await notify(supabase, {
    recipientId: target.id,
    type: "week_validated",
    title: "Votre semaine a été modifiée et validée",
    body: `${actor.first_name} ${actor.last_name} a modifié et validé votre semaine du ${updated.week_start}.`,
    relatedEntityType: "weekly_plan",
    relatedEntityId: planId,
  });

  revalidateWeekViews();
  return { ok: true };
}

/**
 * Fonction métier centrale (section 10 du cahier des charges "avant/après
 * absence") : ré-évalue toutes les semaines d'un collaborateur potentiellement
 * affectées par une absence nouvellement créée ou modifiée, et corrige tout
 * jour de télétravail devenu invalide — jamais silencieusement (section 7 et
 * 11). Réutilise `loadEmployeeWeek`/`evaluateWeek` telle quelle : la même
 * logique de règles sert la saisie, la soumission ET cette réconciliation,
 * sans jamais être recopiée. Appelée depuis `createAbsence`/`updateAbsence`,
 * jamais dupliquée ailleurs.
 */
export async function reconcileWeeksForAbsence(supabase: AppSupabaseClient, employeeId: string, startDate: string, endDate: string): Promise<void> {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", employeeId).maybeSingle();
  if (!profile) return;

  // Marge de 10 jours de chaque côté : largement suffisant pour couvrir un
  // enchaînement week-end + jour férié avant de retrouver le vrai dernier
  // jour travaillé (la boucle de `previousWorkingDay`/`nextWorkingDay`
  // plafonne elle-même à 30 jours, mais un tel enchaînement est irréaliste).
  const rangeStart = addDaysStr(startDate, -10);
  const rangeEnd = addDaysStr(endDate, 10);
  const { data: plans } = await supabase
    .from("weekly_plans")
    .select("id, week_start, status")
    .eq("employee_id", employeeId)
    .gte("week_start", mondayOf(rangeStart))
    .lte("week_start", rangeEnd);

  for (const plan of plans ?? []) {
    const week = await loadEmployeeWeek(supabase, profile, plan.week_start);
    const invalidDates = week.selectedDates.filter((d) => !week.result.days.find((day) => day.date === d)?.selected);
    if (invalidDates.length === 0) continue;

    const { error } = await supabase.rpc("reconcile_week_absence_conflict", { p_plan_id: plan.id, p_invalid_dates: invalidDates });
    if (error) continue; // Ne bloque jamais la création/modification de l'absence elle-même.

    if (plan.status === "submitted" || plan.status === "validated") {
      await notify(supabase, {
        recipientId: employeeId,
        type: "week_needs_changes",
        title: "Votre semaine a été rouverte automatiquement",
        body: `Une absence rend un jour de télétravail déjà posé incompatible pour la semaine du ${plan.week_start}. Merci de la corriger et de la resoumettre.`,
        relatedEntityType: "weekly_plan",
        relatedEntityId: plan.id,
      });
    }
  }

  revalidateWeekViews();
}
