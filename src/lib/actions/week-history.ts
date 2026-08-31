"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { AppRole, WeeklyPlanVersionDecisionCode } from "@/lib/supabase/database.types";

export interface WeekHistoryEvent {
  id: string;
  versionNumber: number | null;
  eventType: string;
  occurredAt: string;
  actorName: string;
  actorRole: AppRole | null;
  isOnBehalf: boolean;
  daysBefore: string[] | null;
  daysAfter: string[] | null;
  comment: string | null;
}

export interface WeekHistoryVersion {
  versionNumber: number;
  submittedAt: string;
  submittedByName: string;
  isOnBehalf: boolean;
  decision: WeeklyPlanVersionDecisionCode | null;
  decidedAt: string | null;
  decidedByName: string | null;
  comment: string | null;
  days: string[];
}

export interface WeekHistoryResult {
  ok: true;
  employeeName: string;
  events: WeekHistoryEvent[];
  versions: WeekHistoryVersion[];
}

/** Historique structuré d'une semaine (versions + événements) pour le panneau "Voir l'historique" (section 10-11). */
export async function getWeekHistory(planId: string): Promise<WeekHistoryResult | { ok: false; error: string }> {
  await requireUser();
  const supabase = await createClient();

  const { data: plan } = await supabase.from("weekly_plans").select("id, employee_id").eq("id", planId).maybeSingle();
  if (!plan) return { ok: false, error: "Semaine introuvable." };

  const [{ data: events }, { data: versions }] = await Promise.all([
    supabase.from("weekly_plan_events").select("*").eq("weekly_plan_id", planId).order("occurred_at", { ascending: true }),
    supabase.from("weekly_plan_versions").select("*").eq("weekly_plan_id", planId).order("version_number", { ascending: true }),
  ]);

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: versionDays } = versionIds.length
    ? await supabase.from("weekly_plan_version_days").select("version_id, work_date").in("version_id", versionIds)
    : { data: [] as { version_id: string; work_date: string }[] };

  const actorIds = new Set<string>();
  for (const e of events ?? []) if (e.actor_id) actorIds.add(e.actor_id);
  for (const v of versions ?? []) {
    if (v.submitted_by) actorIds.add(v.submitted_by);
    if (v.decided_by) actorIds.add(v.decided_by);
  }
  actorIds.add(plan.employee_id);

  const { data: actors } = actorIds.size
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", [...actorIds])
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const nameById = new Map((actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
  const employeeName = nameById.get(plan.employee_id) ?? "";

  const daysByVersion = new Map<string, string[]>();
  for (const row of (versionDays ?? []) as unknown as { version_id: string; work_date: string }[]) {
    const list = daysByVersion.get(row.version_id) ?? [];
    list.push(row.work_date);
    daysByVersion.set(row.version_id, list);
  }

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
      isOnBehalf: !!e.actor_id && e.actor_id !== plan.employee_id,
      daysBefore: e.days_before,
      daysAfter: e.days_after,
      comment: e.comment,
    })),
    versions: (versions ?? []).map((v) => ({
      versionNumber: v.version_number,
      submittedAt: v.submitted_at,
      submittedByName: v.submitted_by ? nameById.get(v.submitted_by) ?? "—" : "—",
      isOnBehalf: !!v.submitted_by && v.submitted_by !== plan.employee_id,
      decision: v.decision,
      decidedAt: v.decided_at,
      decidedByName: v.decided_by ? nameById.get(v.decided_by) ?? "—" : null,
      comment: v.comment,
      days: daysByVersion.get(v.id) ?? [],
    })),
  };
}
