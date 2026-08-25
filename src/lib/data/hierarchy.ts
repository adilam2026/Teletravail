import "server-only";
import type { AppSupabaseClient as DB } from "@/lib/supabase/server";
import type { OrganizationalUnitRow, PlanStatus, ProfileRow, SquadRow, TribeRow } from "@/lib/supabase/database.types";
import { weekDates } from "@/lib/rules-engine/calendar";
import { getExceptionsFor, getHolidaysInRange, getRuleSettings, buildDayBadge, type DayBadge } from "@/lib/data/planning";
import { evaluateTeamPresence } from "@/lib/rules-engine/engine";
import type { AbsencePeriod } from "@/lib/rules-engine/types";
import type { TeamPresenceDay } from "@/lib/rules-engine/types";

/**
 * Accès à la hiérarchie DU (Responsable) -> Tribe (Lead) -> Squad (Lead) ->
 * Collaborateur. Chaque relation est dérivée de la structure organisationnelle
 * (squads.manager_id, tribes.manager_id, organizational_units.manager_id)
 * plutôt que d'un simple `manager_id` sur le profil — cf. migration 0004.
 */

export async function getSquadLedBy(supabase: DB, leadId: string): Promise<SquadRow | null> {
  const { data } = await supabase.from("squads").select("*").eq("manager_id", leadId).maybeSingle();
  return data ?? null;
}

export async function getSquadMembers(supabase: DB, squadId: string): Promise<ProfileRow[]> {
  const { data } = await supabase.from("profiles").select("*").eq("squad_id", squadId).eq("status", "active").order("first_name");
  return data ?? [];
}

export async function getTribeLedBy(supabase: DB, leadId: string): Promise<TribeRow | null> {
  const { data } = await supabase.from("tribes").select("*").eq("manager_id", leadId).maybeSingle();
  return data ?? null;
}

export async function getSquadsForTribe(supabase: DB, tribeId: string): Promise<SquadRow[]> {
  const { data } = await supabase.from("squads").select("*").eq("tribe_id", tribeId).order("name");
  return data ?? [];
}

export async function getDuLedBy(supabase: DB, leadId: string): Promise<OrganizationalUnitRow | null> {
  const { data } = await supabase.from("organizational_units").select("*").eq("manager_id", leadId).maybeSingle();
  return data ?? null;
}

export async function getTribesForDu(supabase: DB, duId: string): Promise<TribeRow[]> {
  const { data } = await supabase.from("tribes").select("*").eq("organizational_unit_id", duId).order("name");
  return data ?? [];
}

/** Tous les collaborateurs (employee) rattachés, directement ou via les squads, à une tribe. */
export async function getMembersForTribe(supabase: DB, tribeId: string): Promise<{ squads: SquadRow[]; squadLeads: ProfileRow[]; members: ProfileRow[] }> {
  const squads = await getSquadsForTribe(supabase, tribeId);
  const squadIds = squads.map((s) => s.id);
  const leadIds = squads.map((s) => s.manager_id).filter((x): x is string => !!x);

  const [{ data: squadLeads }, { data: members }] = await Promise.all([
    leadIds.length ? supabase.from("profiles").select("*").in("id", leadIds) : Promise.resolve({ data: [] as ProfileRow[] }),
    squadIds.length
      ? supabase.from("profiles").select("*").in("squad_id", squadIds).eq("status", "active").order("first_name")
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);

  return { squads, squadLeads: squadLeads ?? [], members: members ?? [] };
}

/** Structure complète d'une DU : tribes, leurs squads, squad leads et collaborateurs. */
export async function getStructureForDu(
  supabase: DB,
  duId: string
): Promise<{ tribes: TribeRow[]; tribeLeads: ProfileRow[]; squads: SquadRow[]; squadLeads: ProfileRow[]; members: ProfileRow[] }> {
  const tribes = await getTribesForDu(supabase, duId);
  const tribeLeadIds = tribes.map((t) => t.manager_id).filter((x): x is string => !!x);
  const tribeIds = tribes.map((t) => t.id);

  const [{ data: tribeLeads }, { data: squads }] = await Promise.all([
    tribeLeadIds.length ? supabase.from("profiles").select("*").in("id", tribeLeadIds) : Promise.resolve({ data: [] as ProfileRow[] }),
    tribeIds.length ? supabase.from("squads").select("*").in("tribe_id", tribeIds).order("name") : Promise.resolve({ data: [] as SquadRow[] }),
  ]);

  const squadIds = (squads ?? []).map((s) => s.id);
  const squadLeadIds = (squads ?? []).map((s) => s.manager_id).filter((x): x is string => !!x);

  const [{ data: squadLeads }, { data: members }] = await Promise.all([
    squadLeadIds.length ? supabase.from("profiles").select("*").in("id", squadLeadIds) : Promise.resolve({ data: [] as ProfileRow[] }),
    squadIds.length
      ? supabase.from("profiles").select("*").in("squad_id", squadIds).eq("status", "active").order("first_name")
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);

  return { tribes, tribeLeads: tribeLeads ?? [], squads: squads ?? [], squadLeads: squadLeads ?? [], members: members ?? [] };
}

/** Rattachés directs d'un responsable — ceux dont il valide personnellement la semaine (section 19). */
export async function getDirectReports(supabase: DB, actor: ProfileRow): Promise<ProfileRow[]> {
  if (actor.role === "squad_lead") {
    const squad = await getSquadLedBy(supabase, actor.id);
    return squad ? getSquadMembers(supabase, squad.id) : [];
  }
  if (actor.role === "tribe_lead") {
    const tribe = await getTribeLedBy(supabase, actor.id);
    if (!tribe) return [];
    const squads = await getSquadsForTribe(supabase, tribe.id);
    const leadIds = squads.map((s) => s.manager_id).filter((x): x is string => !!x);
    if (leadIds.length === 0) return [];
    const { data } = await supabase.from("profiles").select("*").in("id", leadIds).eq("status", "active");
    return data ?? [];
  }
  if (actor.role === "du_head") {
    const du = await getDuLedBy(supabase, actor.id);
    if (!du) return [];
    const tribes = await getTribesForDu(supabase, du.id);
    const leadIds = tribes.map((t) => t.manager_id).filter((x): x is string => !!x);
    if (leadIds.length === 0) return [];
    const { data } = await supabase.from("profiles").select("*").in("id", leadIds).eq("status", "active");
    return data ?? [];
  }
  return [];
}

/**
 * Validateur direct d'un profil, au sens notification (section 19) :
 * Collaborateur -> son Squad Lead, Squad Lead -> son Tribe Lead, Tribe Lead
 * -> son Responsable DU. Un Responsable DU n'a pas de validateur individuel
 * unique (admin ou auto-validation, gérés séparément par l'appelant).
 */
export async function getDirectValidatorId(supabase: DB, profile: ProfileRow): Promise<string | null> {
  if (profile.role === "employee") {
    if (!profile.squad_id) return null;
    const { data } = await supabase.from("squads").select("manager_id").eq("id", profile.squad_id).maybeSingle();
    return data?.manager_id ?? null;
  }
  if (profile.role === "squad_lead") {
    const squad = await getSquadLedBy(supabase, profile.id);
    if (!squad) return null;
    const { data } = await supabase.from("tribes").select("manager_id").eq("id", squad.tribe_id).maybeSingle();
    return data?.manager_id ?? null;
  }
  if (profile.role === "tribe_lead") {
    const tribe = await getTribeLedBy(supabase, profile.id);
    if (!tribe) return null;
    const { data } = await supabase.from("organizational_units").select("manager_id").eq("id", tribe.organizational_unit_id).maybeSingle();
    return data?.manager_id ?? null;
  }
  return null;
}

export async function countPendingValidations(supabase: DB, actor: ProfileRow): Promise<number> {
  const reports = await getDirectReports(supabase, actor);
  if (reports.length === 0) return 0;
  const { count } = await supabase
    .from("weekly_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .in("employee_id", reports.map((r) => r.id));
  return count ?? 0;
}

export interface GroupMemberWeek {
  profile: ProfileRow;
  planId: string | null;
  status: PlanStatus | "not_submitted";
  days: { date: string; icon: string; label: string }[];
}

export interface GroupWeekOverview {
  members: GroupMemberWeek[];
  presence: TeamPresenceDay[];
}

/**
 * Vue d'ensemble d'un groupe de collaborateurs pour une semaine donnée — un
 * aller-retour BD groupé, réutilisé pour les vues Squad / Tribe / DU (seule
 * la liste de membres change), alimentant planning et indicateur de présence.
 */
export async function loadGroupWeek(supabase: DB, members: ProfileRow[], weekStart: string): Promise<GroupWeekOverview> {
  const dates = weekDates(weekStart);
  const weekEnd = dates[4]!;
  const memberIds = members.map((m) => m.id);
  const squadIds = [...new Set(members.map((m) => m.squad_id).filter((x): x is string => !!x))];

  const [settings, holidays, exceptions, { data: plans }] = await Promise.all([
    getRuleSettings(supabase),
    getHolidaysInRange(supabase, weekStart, weekEnd),
    getExceptionsFor(supabase, memberIds, squadIds, weekStart, weekEnd),
    memberIds.length
      ? supabase.from("weekly_plans").select("*").in("employee_id", memberIds).eq("week_start", weekStart)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const { data: absences } = memberIds.length
    ? await supabase
        .from("absences")
        .select("employee_id, start_date, end_date, absence_types(name)")
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

  const absencesByMember = new Map<string, AbsencePeriod[]>();
  for (const row of (absences ?? []) as unknown as {
    employee_id: string;
    start_date: string;
    end_date: string;
    absence_types: { name: string } | null;
  }[]) {
    const list = absencesByMember.get(row.employee_id) ?? [];
    list.push({ startDate: row.start_date, endDate: row.end_date, triggersReturnRule: true, typeName: row.absence_types?.name });
    absencesByMember.set(row.employee_id, list);
  }

  const officeCounts: Record<string, { officeCount: number; totalCount: number }> = {};
  for (const date of dates) officeCounts[date] = { officeCount: 0, totalCount: 0 };

  const memberWeeks: GroupMemberWeek[] = members.map((profile) => {
    const plan = planByMember.get(profile.id);
    const selected = plan ? teleworkByPlan.get(plan.id) ?? new Set<string>() : new Set<string>();
    const memberAbsences = absencesByMember.get(profile.id) ?? [];

    const days = dates.map((date) => {
      const badge: DayBadge | null = buildDayBadge(date, holidays, memberAbsences, exceptions);
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
