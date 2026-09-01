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
import type { WeekEvaluationInput, WeekEvaluationResult } from "@/lib/rules-engine/types";
import type { ProfileRow, WeeklyPlanRow } from "@/lib/supabase/database.types";
import type { AppSupabaseClient as DB } from "@/lib/supabase/server";
import { addWeeks, monthWeeksOwned, nowIso } from "@/lib/date/casablanca";
import { perfTime } from "@/lib/perf";

const BRIDGE_BUFFER_DAYS = 14;

export async function getRuleSettings(supabase: DB): Promise<RuleSettings> {
  const { data } = await supabase.from("telework_rules").select("key, value");
  return parseRuleSettings((data ?? []) as { key: string; value: unknown }[]);
}

/**
 * Requête seule (sans l'arithmétique de résolution), pour pouvoir la lancer
 * en parallèle des autres requêtes indépendantes d'une semaine/d'un mois —
 * elle ne dépend d'aucune d'entre elles, inutile de l'attendre à part
 * (section 7 du cahier des charges perf : paralléliser après login/chargement).
 */
export async function getQuotaOverride(supabase: DB, employeeId: string): Promise<number | null> {
  const { data } = await supabase
    .from("rule_overrides")
    .select("weekly_quota")
    .eq("employee_id", employeeId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.weekly_quota ?? null;
}

export async function getResolvedQuota(supabase: DB, profile: ProfileRow, settings: RuleSettings): Promise<number> {
  const override = await getQuotaOverride(supabase, profile.id);
  const employeeType = profile.employee_type ?? "internal";
  return resolveWeeklyQuota(employeeType, settings, override);
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

/**
 * Exceptions applicables à un ou plusieurs collaborateurs / squads — le même
 * appel sert l'agenda d'un seul collaborateur (tableaux à un élément) et les
 * vues d'équipe agrégées (Squad/Tribe/DU) qui couvrent plusieurs squads.
 */
export async function getExceptionsFor(
  supabase: DB,
  employeeIds: string[],
  squadIds: string[],
  start: string,
  end: string
): Promise<ExceptionPeriod[]> {
  const { data } = await supabase
    .from("company_exceptions")
    .select("start_date, end_date, type, name, scope, squad_id, employee_id")
    .lte("start_date", end)
    .gte("end_date", start);
  return (data ?? [])
    .filter(
      (row) =>
        row.scope === "company" ||
        (row.scope === "squad" && !!row.squad_id && squadIds.includes(row.squad_id)) ||
        (row.scope === "employee" && !!row.employee_id && employeeIds.includes(row.employee_id))
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

/**
 * Télétravail déjà posé sur le vendredi précédent et le lundi suivant cette
 * semaine — nécessaire à la règle "pont vendredi/lundi" (`fridayMondayBridgeForbidden`).
 * Ne crée jamais de weekly_plan pour les semaines voisines : une semaine
 * jamais ouverte n'a évidemment aucun jour sélectionné.
 */
export async function getAdjacentBridgeSelections(
  supabase: DB,
  employeeId: string,
  weekStart: string
): Promise<{ previousFriday: boolean; nextMonday: boolean }> {
  const previousFridayDate = addDaysStr(weekStart, -3);
  const previousWeekStart = addDaysStr(weekStart, -7);
  const nextMondayDate = addDaysStr(weekStart, 7);

  const { data: plans } = await supabase
    .from("weekly_plans")
    .select("id, week_start")
    .eq("employee_id", employeeId)
    .in("week_start", [previousWeekStart, nextMondayDate]);

  const planIds = (plans ?? []).map((p) => p.id);
  const { data: days } = planIds.length
    ? await supabase.from("telework_days").select("weekly_plan_id, work_date").in("weekly_plan_id", planIds)
    : { data: [] as { weekly_plan_id: string; work_date: string }[] };

  const previousPlanId = plans?.find((p) => p.week_start === previousWeekStart)?.id;
  const nextPlanId = plans?.find((p) => p.week_start === nextMondayDate)?.id;

  return {
    previousFriday: (days ?? []).some((d) => d.weekly_plan_id === previousPlanId && d.work_date === previousFridayDate),
    nextMonday: (days ?? []).some((d) => d.weekly_plan_id === nextPlanId && d.work_date === nextMondayDate),
  };
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

  // Deux requêtes concurrentes pour le même employé+semaine (ex. le
  // préchargement Next.js d'un lien de la sidebar qui arrive en même temps
  // que la navigation réelle) peuvent toutes les deux constater "aucune
  // ligne" et tenter de la créer : la seconde violerait la contrainte
  // unique (employee_id, week_start). `ignoreDuplicates` absorbe cette
  // course proprement au lieu de faire planter la page.
  const { data: created, error } = await supabase
    .from("weekly_plans")
    .upsert({ employee_id: employeeId, week_start: weekStart, status: "draft" }, { onConflict: "employee_id,week_start", ignoreDuplicates: true })
    .select("*");
  if (created && created[0]) return created[0];

  const { data: afterRace, error: refetchError } = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (afterRace) return afterRace;
  throw new Error((error ?? refetchError)?.message ?? "Impossible de créer la semaine");
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
  /**
   * Entrée complète du moteur de règles, réutilisable telle quelle côté
   * client pour recalculer `evaluateWeek` de façon synchrone à chaque clic
   * (UI optimiste, section "instantanéité" du cahier des charges) sans
   * dupliquer la logique métier ni round-tripper le serveur avant d'afficher
   * le résultat.
   */
  evaluationInput: WeekEvaluationInput;
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

  const [settings, plan, holidays, absences, exceptions, adjacentSelections, quotaOverride] = await Promise.all([
    getRuleSettings(supabase),
    getOrCreateWeeklyPlan(supabase, profile.id, weekStart),
    getHolidaysInRange(supabase, rangeStart, rangeEnd),
    getAbsencesForEmployee(supabase, profile.id, rangeStart, rangeEnd),
    getExceptionsFor(supabase, [profile.id], profile.squad_id ? [profile.squad_id] : [], weekStart, addDaysStr(weekStart, 4)),
    getAdjacentBridgeSelections(supabase, profile.id, weekStart),
    getQuotaOverride(supabase, profile.id),
  ]);
  const quota = resolveWeeklyQuota(profile.employee_type ?? "internal", settings, quotaOverride);

  // Ces deux requêtes dépendent de `plan.id` (créé ci-dessus si besoin) mais
  // pas l'une de l'autre : parallélisées plutôt qu'enchaînées.
  const [{ data: days }, priorWeeksSelections] = await Promise.all([
    supabase.from("telework_days").select("work_date").eq("weekly_plan_id", plan.id),
    settings.rotationEnabled ? getPriorWeeksSelections(supabase, profile.id, weekStart, settings.rotationWeeks) : Promise.resolve([]),
  ]);
  const selectedDates = (days ?? []).map((d) => d.work_date);

  const evaluationInput: WeekEvaluationInput = {
    weekStart,
    selectedDates,
    employee: { employeeId: profile.id, employeeType: profile.employee_type ?? "internal", weeklyQuota: quota },
    settings,
    holidays,
    absences,
    exceptions,
    priorWeeksSelections,
    adjacentSelections,
    now: nowIso(),
  };
  const result = evaluateWeek(evaluationInput);

  const badges = Object.fromEntries(
    weekDates(weekStart).map((date) => [date, buildDayBadge(date, holidays, absences, exceptions)])
  );

  return { plan, selectedDates, settings, result, badges, evaluationInput };
}

export interface EmployeeMonthWeek {
  weekStart: string;
  plan: WeeklyPlanRow;
  badges: Record<string, DayBadge | null>;
  evaluationInput: WeekEvaluationInput;
  result: WeekEvaluationResult;
}

export interface EmployeeMonthContext {
  month: string;
  weeks: EmployeeMonthWeek[];
}

/**
 * Équivalent de `loadEmployeeWeek`, mais pour tout un mois affiché en une
 * seule page (section 1-24 du cahier des charges "vue mensuelle") : une
 * poignée de requêtes couvrant toute la période, jamais une par semaine ni
 * une par jour, pour que 4 à 6 semaines simultanées ne coûtent pas 4 à 6 fois
 * plus cher qu'une seule (section 20). Chaque semaine du mois obtient sa
 * propre ligne `weekly_plans` (créée si besoin, comme `loadEmployeeWeek` le
 * fait déjà pour une semaine seule) ; les semaines voisines chargées en plus
 * ne servent qu'au calcul des règles inter-semaines (rotation, pont
 * vendredi/lundi) et ne sont jamais créées si elles n'existaient pas déjà.
 */
export async function loadEmployeeMonth(supabase: DB, profile: ProfileRow, month: string): Promise<EmployeeMonthContext> {
  return perfTime(`loadEmployeeMonth ${month}`, () => loadEmployeeMonthInner(supabase, profile, month));
}

async function loadEmployeeMonthInner(supabase: DB, profile: ProfileRow, month: string): Promise<EmployeeMonthContext> {
  const weekStarts = monthWeeksOwned(month);
  if (weekStarts.length === 0) return { month, weeks: [] };

  const [settings, quotaOverride] = await Promise.all([getRuleSettings(supabase), getQuotaOverride(supabase, profile.id)]);
  const quota = resolveWeeklyQuota(profile.employee_type ?? "internal", settings, quotaOverride);

  const bufferWeeksBefore = Math.max(settings.rotationEnabled ? settings.rotationWeeks : 0, 2);
  const bufferWeeksAfter = 2;

  const firstWeek = weekStarts[0]!;
  const lastWeek = weekStarts[weekStarts.length - 1]!;
  const rangeStartWeek = addWeeks(firstWeek, -bufferWeeksBefore);
  const rangeEndWeek = addWeeks(lastWeek, bufferWeeksAfter);
  const rangeStart = rangeStartWeek;
  const rangeEnd = addDaysStr(rangeEndWeek, 4);

  const touchedWeekStarts: string[] = [];
  for (let cursor = rangeStartWeek; cursor <= rangeEndWeek; cursor = addWeeks(cursor, 1)) {
    touchedWeekStarts.push(cursor);
  }

  const [holidays, absences, exceptions, { data: existingPlans }] = await Promise.all([
    getHolidaysInRange(supabase, rangeStart, rangeEnd),
    getAbsencesForEmployee(supabase, profile.id, rangeStart, rangeEnd),
    getExceptionsFor(supabase, [profile.id], profile.squad_id ? [profile.squad_id] : [], rangeStart, rangeEnd),
    supabase.from("weekly_plans").select("*").eq("employee_id", profile.id).in("week_start", touchedWeekStarts),
  ]);

  const planByWeek = new Map((existingPlans ?? []).map((p) => [p.week_start, p]));

  const missingTargetWeeks = weekStarts.filter((w) => !planByWeek.has(w));
  if (missingTargetWeeks.length > 0) {
    // `ignoreDuplicates` : deux requêtes concurrentes pour le même mois (ex.
    // préchargement de la sidebar + navigation réelle) peuvent constater les
    // mêmes semaines manquantes et tenter de les créer toutes les deux — la
    // seconde violerait sinon la contrainte unique (employee_id, week_start)
    // et ferait planter la page (observé en test).
    const { data: created, error } = await supabase
      .from("weekly_plans")
      .upsert(
        missingTargetWeeks.map((week_start) => ({ employee_id: profile.id, week_start, status: "draft" as const })),
        { onConflict: "employee_id,week_start", ignoreDuplicates: true }
      )
      .select("*");
    if (error) throw new Error(error.message);
    for (const p of created ?? []) planByWeek.set(p.week_start, p);

    // Les lignes "ignorées" (créées entre-temps par la requête concurrente)
    // ne reviennent pas dans `created` : on relit seulement ce qui manque encore.
    const stillMissing = missingTargetWeeks.filter((w) => !planByWeek.has(w));
    if (stillMissing.length > 0) {
      const { data: afterRace } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("employee_id", profile.id)
        .in("week_start", stillMissing);
      for (const p of afterRace ?? []) planByWeek.set(p.week_start, p);
    }
  }

  const planIds = [...planByWeek.values()].map((p) => p.id);
  const { data: allDays } = planIds.length
    ? await supabase.from("telework_days").select("weekly_plan_id, work_date").in("weekly_plan_id", planIds)
    : { data: [] as { weekly_plan_id: string; work_date: string }[] };

  const daysByPlanId = new Map<string, string[]>();
  for (const d of allDays ?? []) {
    const list = daysByPlanId.get(d.weekly_plan_id) ?? [];
    list.push(d.work_date);
    daysByPlanId.set(d.weekly_plan_id, list);
  }

  function selectedDatesForWeek(weekStart: string): string[] {
    const plan = planByWeek.get(weekStart);
    if (!plan) return [];
    return daysByPlanId.get(plan.id) ?? [];
  }

  const weeks: EmployeeMonthWeek[] = weekStarts.map((weekStart) => {
    const plan = planByWeek.get(weekStart)!;
    const selectedDates = selectedDatesForWeek(weekStart);

    const priorWeeksSelections: number[][] = [];
    if (settings.rotationEnabled) {
      for (let i = 1; i <= settings.rotationWeeks; i++) {
        const priorWeek = addWeeks(weekStart, -i);
        if (!planByWeek.has(priorWeek)) continue;
        const dates = selectedDatesForWeek(priorWeek);
        const weekdaySet = dates.map((date) => weekDates(priorWeek).indexOf(date) + 1).filter((n) => n > 0);
        priorWeeksSelections.push(weekdaySet);
      }
    }

    const previousFridayDate = addDaysStr(weekStart, -3);
    const previousWeekStart = addWeeks(weekStart, -1);
    const nextMondayWeek = addWeeks(weekStart, 1);

    const evaluationInput: WeekEvaluationInput = {
      weekStart,
      selectedDates,
      employee: { employeeId: profile.id, employeeType: profile.employee_type ?? "internal", weeklyQuota: quota },
      settings,
      holidays,
      absences,
      exceptions,
      priorWeeksSelections,
      adjacentSelections: {
        previousFriday: selectedDatesForWeek(previousWeekStart).includes(previousFridayDate),
        nextMonday: selectedDatesForWeek(nextMondayWeek).includes(nextMondayWeek),
      },
      now: nowIso(),
    };
    const result = evaluateWeek(evaluationInput);
    const badges = Object.fromEntries(weekDates(weekStart).map((date) => [date, buildDayBadge(date, holidays, absences, exceptions)]));

    return { weekStart, plan, badges, evaluationInput, result };
  });

  return { month, weeks };
}
