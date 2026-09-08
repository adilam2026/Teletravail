"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { AbsenceVersionDecisionCode, AppRole } from "@/lib/supabase/database.types";

export interface AbsenceHistoryEvent {
  id: string;
  versionNumber: number | null;
  eventType: string;
  occurredAt: string;
  actorName: string;
  actorRole: AppRole | null;
  isOnBehalf: boolean;
  comment: string | null;
}

export interface AbsenceHistoryVersion {
  versionNumber: number;
  startDate: string;
  endDate: string;
  typeName: string | null;
  submittedAt: string;
  submittedByName: string;
  isOnBehalf: boolean;
  decision: AbsenceVersionDecisionCode | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionComment: string | null;
}

export interface AbsenceHistoryResult {
  ok: true;
  employeeName: string;
  events: AbsenceHistoryEvent[];
  versions: AbsenceHistoryVersion[];
}

/**
 * Historique structuré d'une absence (versions + événements) — même principe
 * que `getWeekHistory` pour le télétravail (section 8 et 26 du cahier des
 * charges "workflow congés" : permettre de reconstruire exactement quelle
 * version avait été validée à chaque étape).
 */
export async function getAbsenceHistory(absenceId: string): Promise<AbsenceHistoryResult | { ok: false; error: string }> {
  await requireUser();
  const supabase = await createClient();

  const { data: absence } = await supabase.from("absences").select("id, employee_id").eq("id", absenceId).maybeSingle();
  if (!absence) return { ok: false, error: "Absence introuvable." };

  const [{ data: events }, { data: versions }] = await Promise.all([
    supabase.from("absence_events").select("*").eq("absence_id", absenceId).order("occurred_at", { ascending: true }),
    supabase.from("absence_versions").select("*, absence_types(name)").eq("absence_id", absenceId).order("version_number", { ascending: true }),
  ]);

  const actorIds = new Set<string>();
  for (const e of events ?? []) if (e.actor_id) actorIds.add(e.actor_id);
  for (const v of versions ?? []) {
    if (v.submitted_by) actorIds.add(v.submitted_by);
    if (v.decided_by) actorIds.add(v.decided_by);
  }
  actorIds.add(absence.employee_id);

  const { data: actors } = actorIds.size
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", [...actorIds])
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const nameById = new Map((actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
  const employeeName = nameById.get(absence.employee_id) ?? "";

  return {
    ok: true,
    employeeName,
    events: (events ?? []).map((e) => ({
      id: e.id,
      versionNumber: e.version_number,
      eventType: e.event_type,
      occurredAt: e.occurred_at,
      actorName: e.actor_id ? nameById.get(e.actor_id) ?? "—" : "—",
      actorRole: e.actor_role,
      isOnBehalf: !!e.actor_id && e.actor_id !== absence.employee_id,
      comment: e.comment,
    })),
    versions: ((versions ?? []) as unknown as { absence_types: { name: string } | null; [k: string]: unknown }[]).map((v) => ({
      versionNumber: v.version_number as number,
      startDate: v.start_date as string,
      endDate: v.end_date as string,
      typeName: v.absence_types?.name ?? null,
      submittedAt: v.submitted_at as string,
      submittedByName: v.submitted_by ? nameById.get(v.submitted_by as string) ?? "—" : "—",
      isOnBehalf: !!v.submitted_by && v.submitted_by !== absence.employee_id,
      decision: v.decision as AbsenceVersionDecisionCode | null,
      decidedAt: v.decided_at as string | null,
      decidedByName: v.decided_by ? nameById.get(v.decided_by as string) ?? "—" : null,
      decisionComment: v.decision_comment as string | null,
    })),
  };
}
