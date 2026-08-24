import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { ProfileRow, TeamRow } from "@/lib/supabase/database.types";

export async function getManagerTeam(
  supabase: AppSupabaseClient,
  managerId: string
): Promise<{ team: TeamRow | null; members: ProfileRow[] }> {
  const { data: team } = await supabase.from("teams").select("*").eq("manager_id", managerId).maybeSingle();
  if (!team) return { team: null, members: [] };

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("team_id", team.id)
    .order("first_name", { ascending: true });

  return { team, members: members ?? [] };
}

import { weekDates } from "@/lib/rules-engine/calendar";
import { getExceptionsFor, getHolidaysInRange, buildDayBadge, type DayBadge } from "@/lib/data/planning";
import type { PlanStatus } from "@/lib/supabase/database.types";
import { evaluateTeamPresence } from "@/lib/rules-engine/engine";
import { getRuleSettings } from "@/lib/data/planning";
import type { TeamPresenceDay } from "@/lib/rules-engine/types";

export interface TeamMemberWeek {
  profile: ProfileRow;
  planId: string | null;
  status: PlanStatus | "not_submitted";
  days: { date: string; icon: string; label: string }[];
}

export interface TeamWeekOverview {
  members: TeamMemberWeek[];
  presence: TeamPresenceDay[];
}

/**
 * Vue d'ensemble d'une équipe pour une semaine donnée : un aller-retour BD
 * groupé (pas une requête par collaborateur) pour alimenter le planning
 * manager (section 21) et l'indicateur de présence (section 24).
 */
export async function loadTeamWeek(
  supabase: AppSupabaseClient,
  team: TeamRow,
  members: ProfileRow[],
  weekStart: string
): Promise<TeamWeekOverview> {
  const dates = weekDates(weekStart);
  const weekEnd = dates[4]!;
  const memberIds = members.map((m) => m.id);

  const [settings, holidays, exceptions, { data: plans }] = await Promise.all([
    getRuleSettings(supabase),
    getHolidaysInRange(supabase, weekStart, weekEnd),
    getExceptionsFor(supabase, "", team.id, weekStart, weekEnd),
    memberIds.length
      ? supabase.from("weekly_plans").select("*").in("employee_id", memberIds).eq("week_start", weekStart)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const { data: absences } = memberIds.length
    ? await supabase
        .from("absences")
        .select("employee_id, start_date, end_date, absence_types(triggers_return_rule, name)")
        .in("employee_id", memberIds)
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart)
    : { data: [] as never[] };

  const planByMember = new Map((plans ?? []).map((p) => [p.employee_id, p]));
  const planIds = (plans ?? []).map((p) => p.id);
  const { data: teleworkDays } = planIds.length
    ? await supabase.from("telework_days").select("weekly_plan_id, work_date").in("weekly_plan_id", planIds)
    : { data: [] as { weekly_plan_id: string; work_date: string }[] };

  const teleworkByPlan = new Map<string, Set<string>>();
  for (const d of teleworkDays ?? []) {
    const set = teleworkByPlan.get(d.weekly_plan_id) ?? new Set<string>();
    set.add(d.work_date);
    teleworkByPlan.set(d.weekly_plan_id, set);
  }

  const absencesByMember = new Map<string, { startDate: string; endDate: string; typeName?: string }[]>();
  for (const row of (absences ?? []) as unknown as {
    employee_id: string;
    start_date: string;
    end_date: string;
    absence_types: { name: string } | null;
  }[]) {
    const list = absencesByMember.get(row.employee_id) ?? [];
    list.push({ startDate: row.start_date, endDate: row.end_date, typeName: row.absence_types?.name });
    absencesByMember.set(row.employee_id, list);
  }

  const officeCounts: Record<string, { officeCount: number; totalCount: number }> = {};
  for (const date of dates) officeCounts[date] = { officeCount: 0, totalCount: 0 };

  const memberWeeks: TeamMemberWeek[] = members.map((profile) => {
    const plan = planByMember.get(profile.id);
    const selected = plan ? teleworkByPlan.get(plan.id) ?? new Set<string>() : new Set<string>();
    const memberAbsences = absencesByMember.get(profile.id) ?? [];

    const days = dates.map((date) => {
      const badge: DayBadge | null = buildDayBadge(
        date,
        holidays,
        memberAbsences.map((a) => ({ startDate: a.startDate, endDate: a.endDate, triggersReturnRule: true, typeName: a.typeName })),
        exceptions
      );
      const isTelework = selected.has(date);

      officeCounts[date]!.totalCount += 1;
      if (!isTelework && !badge) officeCounts[date]!.officeCount += 1;

      if (badge) return { date, icon: badge.icon, label: badge.label };
      if (isTelework) return { date, icon: "🏠", label: "Télétravail" };
      return { date, icon: "🏢", label: "Bureau" };
    });

    return { profile, planId: plan?.id ?? null, status: plan?.status ?? "not_submitted", days };
  });

  const presence = evaluateTeamPresence(dates, officeCounts, settings);

  return { members: memberWeeks, presence };
}

export async function countPendingValidations(supabase: AppSupabaseClient, managerId: string): Promise<number> {
  const { team } = await getManagerTeam(supabase, managerId);
  if (!team) return 0;
  const { data: members } = await supabase.from("profiles").select("id").eq("team_id", team.id);
  const ids = (members ?? []).map((m) => m.id);
  if (ids.length === 0) return 0;

  const { count } = await supabase
    .from("weekly_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .in("employee_id", ids);

  return count ?? 0;
}
