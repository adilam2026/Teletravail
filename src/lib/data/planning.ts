import "server-only";
import { addDaysStr, weekDates } from "@/lib/rules-engine/calendar";
import { parseRuleSettings } from "@/lib/rules-engine";
import type {
  AbsencePeriod,
  ExceptionPeriod,
  HolidayDate,
  RuleSettings,
} from "@/lib/rules-engine";
import { evaluateWeek, resolveWeeklyQuota } from "@/lib/rules-engine/engine";
import type { WeekEvaluationResult } from "@/lib/rules-engine/types";
import type { ProfileRow, WeeklyPlanRow } from "@/lib/supabase/database.types";
import type { AppSupabaseClient as DB } from "@/lib/supabase/server";
import { nowIso } from "@/lib/date/casablanca";

const BRIDGE_BUFFER_DAYS = 14;

export async function getRuleSettings(supabase: DB): Promise<RuleSettings> {
  const { data } = await supabase.from("telework_rules").select("key, value");
  return parseRuleSettings((data ?? []) as { key: string; value: unknown }[]);
}

export async function getResolvedQuota(supabase: DB, profile: ProfileRow, settings: RuleSettings): Promise<number> {
  const { data } = await supabase
    .from("rule_overrides")
    .select("weekly_quota")
    .eq("employee_id", profile.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const employeeType = profile.employee_type ?? "internal";
  return resolveWeeklyQuota(employeeType, settings, data?.weekly_quota ?? null);
}

export async function getHolidaysInRange(supabase: DB, start: string, end: string): Promise<HolidayDate[]> {
  const { data } = await supabase
    .from("public_holidays")
    .select("date, name, status")
    .gte("date", start)
    .lte("date", end);
  return (data ?? []) as HolidayDate[];
}

export async function getAbsencesForEmployee(
  supabase: DB,
  employeeId: string,
  start: string,
  end: string
): Promise<AbsencePeriod[]> {
  const { data } = await supabase
    .from("absences")
    .select("start_date, end_date, absence_types(triggers_return_rule, name)")
    .eq("employee_id", employeeId)
    .gte("end_date", start)
    .lte("start_date", end);

  return ((data ?? []) as unknown as {
    start_date: string;
    end_date: string;
    absence_types: { triggers_return_rule: boolean; name: string } | null;
  }[]).map((row) => ({
    startDate: row.start_date,
    endDate: row.end_date,
    triggersReturnRule: row.absence_types?.triggers_return_rule ?? true,
    typeName: row.absence_types?.name,
  }));
}

export async function getExceptionsFor(
  supabase: DB,
  employeeId: string,
  teamId: string | null,
  start: string,
  end: string
): Promise<ExceptionPeriod[]> {
  const { data } = await supabase
    .from("company_exceptions")
    .select("start_date, end_date, type, name, scope, team_id, employee_id")
    .lte("start_date", end)
    .gte("end_date", start);
  return ((data ?? []) as {
    start_date: string;
    end_date: string;
    type: ExceptionPeriod["type"];
    name: string;
    scope: string;
    team_id: string | null;
    employee_id: string | null;
  }[])
    .filter(
      (row) =>
        row.scope === "company" ||
        (row.scope === "team" && row.team_id === teamId) ||
        (row.scope === "employee" && row.employee_id === employeeId)
    )
    .map((row) => ({ startDate: row.start_date, endDate: row.end_date, type: row.type, name: row.name }));
}

/** Jeux de jours (1-5) télétravaillés lors des N semaines précédant `weekStart`. */
export async function getPriorWeeksSelections(
  supabase: DB,
  employeeId: string,
  weekStart: string,
  weeks: number
): Promise<number[][]> {
  const earliestWeek = addDaysStr(weekStart, -7 * weeks);
  const { data: plans } = await supabase
    .from("weekly_plans")
    .select("id, week_start")
    .eq("employee_id", employeeId)
    .gte("week_start", earliestWeek)
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false });

  if (!plans || plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const { data: days } = await supabase
    .from("telework_days")
    .select("weekly_plan_id, work_date")
    .in("weekly_plan_id", planIds);

  const byPlan = new Map<string, string[]>();
  for (const d of days ?? []) {
    const list = byPlan.get(d.weekly_plan_id) ?? [];
    list.push(d.work_date);
    byPlan.set(d.weekly_plan_id, list);
  }

  return plans.map((plan) => {
    const dates = byPlan.get(plan.id) ?? [];
    const weekdaySet = dates.map((date) => weekDates(plan.week_start).indexOf(date) + 1).filter((n) => n > 0);
    return weekdaySet;
  });
}

export async function getOrCreateWeeklyPlan(
  supabase: DB,
  employeeId: string,
  weekStart: string
): Promise<WeeklyPlanRow> {
  const { data: existing } = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("weekly_plans")
    .insert({ employee_id: employeeId, week_start: weekStart, status: "draft" })
    .select("*")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Impossible de créer la semaine");
  return created;
}

export type DayBadgeKind = "holiday_national" | "holiday_religious" | "absence_leave" | "absence_sick" | "absence_other" | "exception";

export interface DayBadge {
  kind: DayBadgeKind;
  icon: string;
  label: string;
}

/** Icône/libellé d'un jour hors logique de sélection (férié, absence, exception) — section 11 du cahier des charges. */
export function buildDayBadge(
  date: string,
  holidays: HolidayDate[],
  absences: AbsencePeriod[],
  exceptions: ExceptionPeriod[]
): DayBadge | null {
  const holiday = holidays.find((h) => h.date === date);
  if (holiday) {
    return holiday.name.toLowerCase().includes("aïd") || holiday.name.toLowerCase().includes("moharram") || holiday.name.toLowerCase().includes("mawlid")
      ? { kind: "holiday_religious", icon: "🕌", label: holiday.status === "provisional" ? `${holiday.name} (prévisionnel)` : holiday.name }
      : { kind: "holiday_national", icon: "🇲🇦", label: holiday.name };
  }

  const absence = absences.find((a) => date >= a.startDate && date <= a.endDate);
  if (absence) {
    const name = (absence.typeName ?? "").toLowerCase();
    if (name.includes("malad")) return { kind: "absence_sick", icon: "🤒", label: absence.typeName ?? "Maladie" };
    if (name.includes("cong")) return { kind: "absence_leave", icon: "🌴", label: absence.typeName ?? "Congé" };
    return { kind: "absence_other", icon: "📅", label: absence.typeName ?? "Absence" };
  }

  const exception = exceptions.find((e) => date >= e.startDate && date <= e.endDate);
  if (exception) return { kind: "exception", icon: "🔒", label: exception.name };

  return null;
}

export interface EmployeeWeekContext {
  plan: WeeklyPlanRow;
  selectedDates: string[];
  settings: RuleSettings;
  result: WeekEvaluationResult;
  badges: Record<string, DayBadge | null>;
}

/**
 * Point d'entrée unique du moteur de règles pour une semaine d'un
 * collaborateur : récupère toutes les données nécessaires (férié, absences,
 * exceptions, rotation) et délègue le calcul à `evaluateWeek`. Utilisé aussi
 * bien par l'agenda collaborateur, la vue équipe du manager, que les server
 * actions de mutation — la logique métier n'existe qu'à un seul endroit.
 */
export async function loadEmployeeWeek(
  supabase: DB,
  profile: ProfileRow,
  weekStart: string
): Promise<EmployeeWeekContext> {
  const rangeStart = addDaysStr(weekStart, -BRIDGE_BUFFER_DAYS);
  const rangeEnd = addDaysStr(weekStart, 4 + BRIDGE_BUFFER_DAYS);

  const [settings, plan, holidays, absences, exceptions] = await Promise.all([
    getRuleSettings(supabase),
    getOrCreateWeeklyPlan(supabase, profile.id, weekStart),
    getHolidaysInRange(supabase, rangeStart, rangeEnd),
    getAbsencesForEmployee(supabase, profile.id, rangeStart, rangeEnd),
    getExceptionsFor(supabase, profile.id, profile.team_id, weekStart, addDaysStr(weekStart, 4)),
  ]);

  const quota = await getResolvedQuota(supabase, profile, settings);

  const { data: days } = await supabase.from("telework_days").select("work_date").eq("weekly_plan_id", plan.id);
  const selectedDates = (days ?? []).map((d) => d.work_date);

  const priorWeeksSelections = settings.rotationEnabled
    ? await getPriorWeeksSelections(supabase, profile.id, weekStart, settings.rotationWeeks)
    : [];

  const result = evaluateWeek({
    weekStart,
    selectedDates,
    employee: { employeeId: profile.id, employeeType: profile.employee_type ?? "internal", weeklyQuota: quota },
    settings,
    holidays,
    absences,
    exceptions,
    priorWeeksSelections,
    now: nowIso(),
  });

  const badges = Object.fromEntries(
    weekDates(weekStart).map((date) => [date, buildDayBadge(date, holidays, absences, exceptions)])
  );

  return { plan, selectedDates, settings, result, badges };
}
