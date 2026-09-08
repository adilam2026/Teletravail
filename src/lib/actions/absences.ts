"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { perfTime } from "@/lib/perf";
import { getDirectValidatorId } from "@/lib/data/hierarchy";
import { reconcileWeeksForAbsence } from "@/lib/actions/weeks";
import type { ActionResult } from "@/lib/actions/account";
import type { AbsenceRow, AbsenceRequestKind, AbsenceVersionDecisionCode } from "@/lib/supabase/database.types";

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

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Déclare une absence — brouillon pour soi-même (jamais auto-validée par son
 * propre auteur), directement validée quand un supérieur/admin la déclare
 * pour un rattaché (même principe que la saisie manager du télétravail :
 * jamais de "soumission à soi-même"). Une seule transaction serveur
 * (création + version + événement + audit) via `create_absence` (0016),
 * l'autorisation réelle restant portée par la policy RLS `absences_insert`
 * (inchangée depuis 0006).
 */
export async function createAbsence(input: AbsenceInput): Promise<ActionResult> {
  const { profile } = await requireUser();
  if (input.endDate < input.startDate) return { ok: false, error: "La date de fin doit suivre la date de début." };

  const supabase = await createClient();
  const { data: absence, error } = await perfTime("create_absence RPC", () =>
    supabase.rpc("create_absence", {
      p_employee_id: input.employeeId,
      p_absence_type_id: input.absenceTypeId,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_comment: input.comment?.trim() || null,
    })
  );
  if (error || !absence) return { ok: false, error: "Création impossible (hors de votre périmètre ?)." };

  await reconcileWeeksForAbsence(supabase, input.employeeId, input.startDate, input.endDate);

  if (absence.status === "validated" && input.employeeId !== profile.id) {
    await notify(supabase, {
      recipientId: input.employeeId,
      type: "absence_created_and_validated",
      title: `${profile.first_name} ${profile.last_name} a déclaré et validé une absence pour vous`,
      body: `Du ${input.startDate} au ${input.endDate}.`,
      relatedEntityType: "absence",
      relatedEntityId: absence.id,
    });
  }

  revalidateAbsenceViews();
  return { ok: true };
}

/** Soumission d'un brouillon (ou d'une absence à modifier) — jamais soumise par un supérieur pour son propre compte. */
export async function submitAbsence(absenceId: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: absence, error } = await perfTime("submit_absence RPC", () => supabase.rpc("submit_absence", { p_absence_id: absenceId }));
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Soumission impossible." };
  if (!absence) return { ok: false, error: "Cette absence ne peut pas être soumise." };

  await reconcileWeeksForAbsence(supabase, absence.employee_id, absence.start_date, absence.end_date);

  const validatorId = await getDirectValidatorId(supabase, profile);
  if (validatorId) {
    await notify(supabase, {
      recipientId: validatorId,
      type: "absence_to_validate",
      title: `${profile.first_name} ${profile.last_name} a soumis une demande d'absence`,
      body: `Du ${absence.start_date} au ${absence.end_date}.`,
      relatedEntityType: "absence",
      relatedEntityId: absenceId,
    });
  }

  revalidateAbsenceViews();
  return { ok: true };
}

/** Rappel d'une demande pas encore traitée par le manager (section 17) : le collaborateur récupère la main pour la corriger. */
export async function recallAbsence(absenceId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await perfTime("recall_absence RPC", () => supabase.rpc("recall_absence", { p_absence_id: absenceId }));
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Rappel impossible." };

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

/**
 * Modifie les champs d'une absence — verrouillée pour le collaborateur une
 * fois soumise/validée (trigger `absences_guard`, 0016) : il doit passer par
 * une demande de réouverture. Un supérieur garde la main plus largement
 * (régularisation). Événement + audit + recalcul des contraintes TT sur
 * l'union de l'ancienne et de la nouvelle période (une date raccourcie ou
 * décalée doit aussi pouvoir libérer un jour devenu inutilement verrouillé).
 */
export async function updateAbsence(input: UpdateAbsenceInput): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase.from("absences").select("*").eq("id", input.id).maybeSingle();
  if (!before) return { ok: false, error: "Absence introuvable." };

  const patch: Partial<AbsenceRow> = {};
  if (input.absenceTypeId !== undefined) patch.absence_type_id = input.absenceTypeId;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.comment !== undefined) patch.comment = input.comment;

  const { data: after, error } = await supabase.from("absences").update(patch).eq("id", input.id).select("*").maybeSingle();
  if (error || !after) return { ok: false, error: "Modification impossible (absence verrouillée ou hors de votre périmètre)." };

  const isOnBehalf = actor.id !== before.employee_id;
  await supabase.from("absence_events").insert({
    absence_id: input.id,
    event_type: isOnBehalf ? "modified_by_manager" : "modified_by_employee",
    actor_id: actor.id,
    actor_role: actor.role,
    old_value: { absenceTypeId: before.absence_type_id, startDate: before.start_date, endDate: before.end_date, comment: before.comment },
    new_value: { absenceTypeId: after.absence_type_id, startDate: after.start_date, endDate: after.end_date, comment: after.comment },
  });
  await logAudit({ action: "absence_updated", entityType: "absence", entityId: input.id, oldValue: before, newValue: patch });

  await reconcileWeeksForAbsence(
    supabase,
    before.employee_id,
    minDate(before.start_date, after.start_date),
    maxDate(before.end_date, after.end_date)
  );

  revalidateAbsenceViews();
  return { ok: true };
}

/** Décision du validateur sur une absence soumise : valide, ou renvoie pour correction. */
export async function decideAbsence(absenceId: string, decision: AbsenceVersionDecisionCode, comment?: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: absence, error } = await perfTime("decide_absence RPC", () =>
    supabase.rpc("decide_absence", { p_absence_id: absenceId, p_decision: decision, p_comment: comment?.trim() || null })
  );
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Action impossible : hors de votre périmètre de validation." };
  if (!absence) return { ok: false, error: "Cette absence n'est pas en attente de validation." };

  if (decision === "validated") {
    await reconcileWeeksForAbsence(supabase, absence.employee_id, absence.start_date, absence.end_date);
  }

  await notify(supabase, {
    recipientId: absence.employee_id,
    type: decision === "validated" ? "absence_validated" : "absence_needs_changes",
    title: decision === "validated" ? "Votre absence a été validée" : "Modification demandée sur votre absence",
    body: comment ?? undefined,
    relatedEntityType: "absence",
    relatedEntityId: absenceId,
  });

  revalidateAbsenceViews();
  return { ok: true };
}

export async function deleteAbsence(id: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible (absence non brouillon, passée, ou hors de votre périmètre)." };

  await logAudit({ action: "absence_deleted", entityType: "absence", entityId: id });
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

/**
 * Demande de réouverture d'une absence déjà validée (modification OU
 * annulation, sections 5 et 9) — une vraie ligne persistante et actionnable
 * par le manager, jamais un simple événement perdu (même principe que
 * `requestWeekReopen`, 0014). Une seule demande active à la fois par
 * absence, contrainte imposée par l'index unique partiel côté serveur.
 */
export async function requestAbsenceReopen(absenceId: string, kind: AbsenceRequestKind, reason?: string): Promise<ActionResult> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: absence } = await supabase.from("absences").select("*").eq("id", absenceId).single();
  if (!absence || absence.employee_id !== profile.id) return { ok: false, error: "Absence introuvable." };
  if (absence.status !== "validated") return { ok: false, error: "Seule une absence validée peut faire l'objet d'une demande." };

  const { error } = await supabase.from("absence_reopen_requests").insert({
    absence_id: absenceId,
    employee_id: profile.id,
    requested_by: profile.id,
    kind,
    reason: reason?.trim() || null,
  });
  // Contrainte unique "une seule demande active à la fois" : un double-clic
  // ne doit jamais faire échouer l'action côté collaborateur.
  if (error && error.code !== "23505") return { ok: false, error: "Demande impossible (une autre demande est peut-être déjà en cours)." };

  const validatorId = await getDirectValidatorId(supabase, profile);
  if (validatorId) {
    await notify(supabase, {
      recipientId: validatorId,
      type: kind === "cancellation" ? "absence_cancellation_requested" : "absence_reopen_requested",
      title:
        kind === "cancellation"
          ? `${profile.first_name} ${profile.last_name} demande l'annulation d'une absence`
          : `${profile.first_name} ${profile.last_name} demande la modification d'une absence`,
      body: `Absence du ${absence.start_date} au ${absence.end_date}, actuellement validée.`,
      relatedEntityType: "absence",
      relatedEntityId: absenceId,
    });
  }

  await supabase.from("absence_events").insert({
    absence_id: absenceId,
    event_type: kind === "cancellation" ? "cancellation_requested" : "reopen_requested",
    actor_id: profile.id,
    actor_role: profile.role,
    status_before: "validated",
    status_after: "validated",
    comment: reason?.trim() || null,
  });
  await logAudit({
    action: kind === "cancellation" ? "absence_cancellation_requested" : "absence_reopen_requested",
    entityType: "absence",
    entityId: absenceId,
    newValue: { reason: reason ?? null },
  });

  revalidateAbsenceViews();
  return { ok: true };
}

/** Décision du manager sur une demande de réouverture (modification ou annulation) — RPC atomique unique (0016). */
export async function decideAbsenceReopenRequest(requestId: string, approve: boolean, comment?: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: updated, error } = await perfTime("decide_absence_reopen_request RPC", () =>
    supabase.rpc("decide_absence_reopen_request", { p_request_id: requestId, p_approve: approve, p_comment: comment?.trim() || null })
  );
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Action impossible : cette demande n'est pas dans votre périmètre." };
  if (!updated) return { ok: false, error: "Cette demande a déjà été traitée." };

  const { data: absence } = await supabase.from("absences").select("employee_id, start_date, end_date, status").eq("id", updated.absence_id).maybeSingle();
  if (absence) {
    if (approve && updated.kind === "cancellation") {
      await reconcileWeeksForAbsence(supabase, absence.employee_id, absence.start_date, absence.end_date);
    }
    await notify(supabase, {
      recipientId: absence.employee_id,
      type: approve ? (updated.kind === "cancellation" ? "absence_cancelled" : "absence_needs_changes") : "absence_reopen_rejected",
      title: approve
        ? updated.kind === "cancellation"
          ? "Votre absence a été annulée"
          : "Votre demande de modification a été acceptée"
        : updated.kind === "cancellation"
          ? "Votre demande d'annulation a été refusée"
          : "Votre demande de modification a été refusée",
      body: approve
        ? updated.kind === "cancellation"
          ? undefined
          : "Vous pouvez à nouveau modifier cette absence."
        : "Votre absence reste validée.",
      relatedEntityType: "absence",
      relatedEntityId: updated.absence_id,
    });
  }

  revalidateAbsenceViews();
  return { ok: true };
}

/** Saisie manager "Enregistrer et valider" (section 13) — valide directement, depuis n'importe quel statut vivant, sans resoumission. */
export async function managerValidateAbsenceNow(absenceId: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { data: absence, error } = await perfTime("manager_validate_absence_now RPC", () =>
    supabase.rpc("manager_validate_absence_now", { p_absence_id: absenceId })
  );
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Action impossible : hors de votre périmètre." };
  if (!absence) return { ok: false, error: "Absence introuvable." };

  await reconcileWeeksForAbsence(supabase, absence.employee_id, absence.start_date, absence.end_date);

  await notify(supabase, {
    recipientId: absence.employee_id,
    type: "absence_manager_override",
    title: "Votre absence a été modifiée et validée",
    body: `${actor.first_name} ${actor.last_name} a modifié et validé votre absence du ${absence.start_date} au ${absence.end_date}.`,
    relatedEntityType: "absence",
    relatedEntityId: absenceId,
  });

  revalidateAbsenceViews();
  return { ok: true };
}

/** Annulation directe par un supérieur (section 14) — jamais de DELETE physique. */
export async function managerCancelAbsence(absenceId: string, comment?: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase.from("absences").select("employee_id, start_date, end_date").eq("id", absenceId).maybeSingle();
  const { data: absence, error } = await perfTime("manager_cancel_absence RPC", () =>
    supabase.rpc("manager_cancel_absence", { p_absence_id: absenceId, p_comment: comment?.trim() || null })
  );
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Action impossible : hors de votre périmètre." };
  if (!absence) return { ok: false, error: "Absence introuvable ou déjà annulée." };

  if (before) {
    await reconcileWeeksForAbsence(supabase, before.employee_id, before.start_date, before.end_date);
  }

  await notify(supabase, {
    recipientId: absence.employee_id,
    type: "absence_manager_cancelled",
    title: "Absence annulée par votre manager",
    body: comment ?? `${actor.first_name} ${actor.last_name} a annulé votre absence du ${absence.start_date} au ${absence.end_date}.`,
    relatedEntityType: "absence",
    relatedEntityId: absenceId,
  });

  revalidateAbsenceViews();
  return { ok: true };
}

/**
 * Le manager renvoie une absence déjà VALIDÉE au collaborateur pour
 * correction (section 15) — de sa propre initiative, sans qu'aucune demande
 * de réouverture n'existe encore. Distinct de `decideAbsence`, qui ne
 * traite qu'une absence encore soumise (sections 2-3).
 */
export async function managerRequestAbsenceChanges(absenceId: string, comment?: string): Promise<ActionResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { data: absence, error } = await perfTime("manager_request_absence_changes RPC", () =>
    supabase.rpc("manager_request_absence_changes", { p_absence_id: absenceId, p_comment: comment?.trim() || null })
  );
  if (error && error.message !== "NO_MATCH") return { ok: false, error: "Action impossible : hors de votre périmètre." };
  if (!absence) return { ok: false, error: "Cette absence n'est pas validée." };

  await notify(supabase, {
    recipientId: absence.employee_id,
    type: "absence_needs_changes",
    title: "Votre manager demande une modification de votre absence",
    body: comment ?? `${actor.first_name} ${actor.last_name} demande une correction sur votre absence du ${absence.start_date} au ${absence.end_date}.`,
    relatedEntityType: "absence",
    relatedEntityId: absenceId,
  });

  revalidateAbsenceViews();
  return { ok: true };
}
