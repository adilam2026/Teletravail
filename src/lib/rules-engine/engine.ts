import { addDaysStr, findHoliday, isHoliday, isoWeekday, weekDates } from "./calendar";
import type {
  AbsencePeriod,
  DayEvaluation,
  EmployeeContext,
  ExceptionPeriod,
  RuleSettings,
  Severity,
  TeamPresenceDay,
  WeekAlert,
  WeekCompliance,
  WeekEvaluationInput,
  WeekEvaluationResult,
} from "./types";

/** Quota hebdomadaire résolu pour un collaborateur : l'override individuel prévaut. */
export function resolveWeeklyQuota(
  employeeType: "internal" | "external",
  settings: RuleSettings,
  individualOverride?: number | null
): number {
  if (individualOverride !== undefined && individualOverride !== null) {
    return individualOverride;
  }
  return employeeType === "internal" ? settings.quotaInternal : settings.quotaExternal;
}

function exceptionAt(date: string, exceptions: ExceptionPeriod[]) {
  return exceptions.filter((e) => date >= e.startDate && date <= e.endDate);
}

/**
 * Le jour `date` est-il un "jour de reprise" obligatoire au bureau,
 * c'est-à-dire le premier jour ouvré suivant une absence qui déclenche la
 * règle (en franchissant éventuellement un week-end et/ou un jour férié) ?
 */
function returnAfterAbsence(
  date: string,
  absences: AbsencePeriod[],
  holidays: { date: string; name: string; status: "provisional" | "confirmed" }[],
  settings: RuleSettings
): AbsencePeriod | null {
  if (!settings.returnAfterAbsenceForbidden) return null;
  for (const absence of absences) {
    if (!absence.triggersReturnRule) continue;
    let d = addDaysStr(absence.endDate, 1);
    for (let i = 0; i < 30; i++) {
      const weekend = isoWeekday(d) >= 6;
      const holiday = settings.returnAfterBridgeEnabled && isHoliday(d, holidays);
      if (!weekend && !holiday) break;
      d = addDaysStr(d, 1);
    }
    if (d === date) return absence;
  }
  return null;
}

interface BaselineBlock {
  ruleCode: DayEvaluation["ruleCode"];
  reason: string;
  severity: Severity;
}

/**
 * Contraintes "structurelles" d'un jour, indépendantes des autres jours
 * sélectionnés dans la semaine (férié, absence, exception, reprise...).
 * Une exception "telework_allowed" lève ces blocages (hors quota / consécutifs).
 */
/**
 * Ordre de priorité des états d'une journée, du plus fort au plus faible :
 * 1. Jour férié / fermeture — 2. Absence — 3. Présence obligatoire —
 * 4. Télétravail — 5. Bureau. Une "autorisation exceptionnelle" reste
 * volontairement au-dessus de tout : c'est une dérogation administrative
 * explicite, elle doit primer même sur un jour férié ou une reprise.
 * Un jour n'est ainsi jamais affiché à la fois en congé et en télétravail.
 */
function baselineForDay(
  date: string,
  input: Pick<WeekEvaluationInput, "holidays" | "absences" | "exceptions" | "settings">
): BaselineBlock | null {
  const { holidays, absences, exceptions, settings } = input;
  const dayExceptions = exceptionAt(date, exceptions);

  const allowedException = dayExceptions.find((e) => e.type === "telework_allowed");
  if (allowedException) return null;

  const holiday = findHoliday(date, holidays);
  if (holiday) {
    return {
      ruleCode: "PUBLIC_HOLIDAY",
      reason: holiday.status === "provisional" ? `Jour férié (${holiday.name}, date prévisionnelle)` : `Jour férié (${holiday.name})`,
      severity: "blocking",
    };
  }

  const absence = returnAfterAbsence(date, absences, holidays, settings);
  if (absence) {
    return {
      ruleCode: "RETURN_AFTER_ABSENCE",
      reason: "Bureau obligatoire – reprise après absence",
      severity: "blocking",
    };
  }

  const forbidding = dayExceptions.find(
    (e) => e.type === "mandatory_office" || e.type === "telework_forbidden" ||
      e.type === "site_closure" || e.type === "company_event" || e.type === "seminar" ||
      e.type === "custom_period"
  );
  if (forbidding) {
    const label = forbidding.type === "mandatory_office" ? "Présence obligatoire" : forbidding.name;
    return { ruleCode: "MANDATORY_OFFICE_DAY", reason: label, severity: "blocking" };
  }

  return null;
}

interface AdjacencyViolation {
  ruleCode: DayEvaluation["ruleCode"];
  reason: string;
}

/** Le jour `dates[idx]` entrerait-il en conflit (consécutif / lundi+vendredi / pont inter-semaines) avec `candidateSelected` ? */
function adjacencyViolation(
  idx: number,
  dates: string[],
  candidateSelected: Set<string>,
  settings: RuleSettings,
  adjacentSelections?: { previousFriday: boolean; nextMonday: boolean }
): AdjacencyViolation | null {
  const date = dates[idx]!;
  const mondayDate = dates[0]!;
  const fridayDate = dates[4]!;

  if (settings.consecutiveDaysForbidden) {
    const prev = idx > 0 ? dates[idx - 1] : null;
    const next = idx < dates.length - 1 ? dates[idx + 1] : null;
    if ((prev && candidateSelected.has(prev)) || (next && candidateSelected.has(next))) {
      return { ruleCode: "CONSECUTIVE_REMOTE_DAYS", reason: "Deux jours de télétravail consécutifs sont interdits" };
    }
  }

  if (settings.mondayFridayForbidden) {
    if (
      (date === mondayDate && candidateSelected.has(fridayDate)) ||
      (date === fridayDate && candidateSelected.has(mondayDate))
    ) {
      return { ruleCode: "MONDAY_FRIDAY_COMBINATION", reason: "Combinaison lundi + vendredi interdite sur la même semaine" };
    }
  }

  if (settings.fridayMondayBridgeForbidden) {
    if (date === mondayDate && adjacentSelections?.previousFriday) {
      return { ruleCode: "FRIDAY_MONDAY_BRIDGE", reason: "Pont interdit : vendredi dernier était déjà en télétravail" };
    }
    if (date === fridayDate && adjacentSelections?.nextMonday) {
      return { ruleCode: "FRIDAY_MONDAY_BRIDGE", reason: "Pont interdit : lundi prochain est déjà en télétravail" };
    }
  }

  return null;
}

/**
 * Quand le quota est atteint, cherche quelles dates actuellement
 * sélectionnées peuvent être libérées pour accueillir `idx` sans provoquer
 * de nouvelle violation (consécutif / lundi+vendredi). Permet le
 * remplacement intelligent d'un jour par un autre en un clic plutôt que
 * d'afficher un blocage sec (section "logique de remplacement intelligent").
 */
function findSwapCandidates(
  idx: number,
  dates: string[],
  selected: Set<string>,
  settings: RuleSettings,
  adjacentSelections?: { previousFriday: boolean; nextMonday: boolean }
): string[] {
  const candidates: string[] = [];
  for (const s of selected) {
    const trial = new Set(selected);
    trial.delete(s);
    if (!adjacencyViolation(idx, dates, trial, settings, adjacentSelections)) candidates.push(s);
  }
  return candidates;
}

/**
 * Évalue une semaine complète : pour chaque jour ouvré, indique s'il est
 * sélectionné et si le télétravail y est possible, avec la raison exacte.
 * Utilisée à la fois côté interface (désactivation proactive) et côté
 * serveur (revalidation avant écriture) — logique unique, non dupliquée.
 */
export function evaluateWeek(input: WeekEvaluationInput): WeekEvaluationResult {
  const { settings } = input;
  const dates = weekDates(input.weekStart);
  const rawSelected = new Set(input.selectedDates);

  // Jours effectivement comptés comme télétravail pour le quota et
  // l'adjacence (jours consécutifs, lundi+vendredi, pont) : un jour "posé"
  // en base mais bloqué par une règle structurelle (férié, reprise après
  // absence, présence obligatoire...) ne doit jamais compter comme du
  // télétravail réel pour les AUTRES jours de la semaine — sinon une
  // sélection devenue caduque (p.ex. une absence déclarée après coup sur un
  // jour déjà télétravaillé) contaminerait injustement ses voisins.
  const baselineByDate = new Map(dates.map((date) => [date, baselineForDay(date, input)]));
  const selected = new Set(dates.filter((date) => rawSelected.has(date) && !baselineByDate.get(date)));
  const quota = input.employee.weeklyQuota;

  const mondayDate = dates[0]!;
  const fridayDate = dates[4]!;
  const mondaySelected = selected.has(mondayDate);
  const fridaySelected = selected.has(fridayDate);

  const days: DayEvaluation[] = dates.map((date, idx) => {
    const weekday = idx + 1;
    const isSelected = selected.has(date);
    const baseline = baselineByDate.get(date)!;

    if (baseline) {
      return {
        date,
        weekday,
        selected: false,
        allowed: false,
        reason: baseline.reason,
        ruleCode: baseline.ruleCode,
        severity: baseline.severity,
        swapCandidates: null,
      };
    }

    if (isSelected) {
      return { date, weekday, selected: true, allowed: true, reason: null, ruleCode: null, severity: null, swapCandidates: null };
    }

    // Pont vendredi / lundi suivant : dépend d'une donnée hors de cette
    // semaine (le jour adjacent, dans une autre semaine), donc jamais
    // résoluble par un remplacement intra-semaine — se vérifie avant la
    // logique de quota pour ne pas afficher un message "quota atteint"
    // trompeur quand quota et pont sont indépendants.
    const bridgeViolation = adjacencyViolation(idx, dates, selected, settings, input.adjacentSelections);
    if (bridgeViolation && bridgeViolation.ruleCode === "FRIDAY_MONDAY_BRIDGE") {
      return {
        date,
        weekday,
        selected: false,
        allowed: false,
        reason: bridgeViolation.reason,
        ruleCode: bridgeViolation.ruleCode,
        severity: "blocking",
        swapCandidates: null,
      };
    }

    // Jour structurellement éligible mais pas encore sélectionné : simuler
    // ce qui se passerait si l'utilisateur cliquait dessus.
    if (selected.size < quota) {
      const violation = adjacencyViolation(idx, dates, selected, settings);
      if (violation) {
        return {
          date,
          weekday,
          selected: false,
          allowed: false,
          reason: violation.reason,
          ruleCode: violation.ruleCode,
          severity: "blocking",
          swapCandidates: null,
        };
      }
      return { date, weekday, selected: false, allowed: true, reason: null, ruleCode: null, severity: null, swapCandidates: null };
    }

    // Quota atteint : chercher un remplacement intelligent avant de bloquer sec.
    const swapCandidates = findSwapCandidates(idx, dates, selected, settings, input.adjacentSelections);
    if (swapCandidates.length === 0) {
      return {
        date,
        weekday,
        selected: false,
        allowed: false,
        reason: `Quota hebdomadaire atteint (${quota} j.)`,
        ruleCode: "MAX_WEEKLY_QUOTA",
        severity: "blocking",
        swapCandidates: null,
      };
    }
    return {
      date,
      weekday,
      selected: false,
      allowed: false,
      reason:
        swapCandidates.length === 1
          ? "Remplacera automatiquement votre jour de télétravail déjà sélectionné"
          : "Quota atteint — choisissez le jour à remplacer",
      ruleCode: "MAX_WEEKLY_QUOTA",
      severity: "blocking",
      swapCandidates,
    };
  });

  const alerts: WeekAlert[] = [];

  // Violations "dures" déjà présentes dans la sélection actuelle (garde-fou,
  // p.ex. si les règles ont changé après une sélection existante) : elles
  // sont remontées comme alertes bloquantes pour que le manager en voie la
  // raison exacte, pas seulement un statut "non conforme".
  if (selected.size > quota) {
    alerts.push({
      ruleCode: "MAX_WEEKLY_QUOTA",
      severity: "blocking",
      message: `Quota hebdomadaire dépassé : ${selected.size}/${quota} jours sélectionnés`,
    });
  }

  if (settings.consecutiveDaysForbidden && hasConsecutive(dates, selected)) {
    alerts.push({
      ruleCode: "CONSECUTIVE_REMOTE_DAYS",
      severity: "blocking",
      message: "Deux jours de télétravail consécutifs sont sélectionnés",
    });
  }

  if (settings.mondayFridayForbidden && mondaySelected && fridaySelected) {
    alerts.push({
      ruleCode: "MONDAY_FRIDAY_COMBINATION",
      severity: "blocking",
      message: "Combinaison lundi + vendredi sélectionnée sur la même semaine",
    });
  }

  if (
    settings.fridayMondayBridgeForbidden &&
    ((mondaySelected && input.adjacentSelections?.previousFriday) || (fridaySelected && input.adjacentSelections?.nextMonday))
  ) {
    alerts.push({
      ruleCode: "FRIDAY_MONDAY_BRIDGE",
      severity: "blocking",
      message: "Pont vendredi / lundi sélectionné entre deux semaines de télétravail",
    });
  }

  if (settings.rotationEnabled && input.priorWeeksSelections && input.priorWeeksSelections.length > 0) {
    const currentSet = days.filter((d) => d.selected).map((d) => d.weekday).sort().join(",");
    if (currentSet.length > 0) {
      const priorSets = input.priorWeeksSelections.map((w) => [...w].sort().join(","));
      const matches = priorSets.filter((s) => s === currentSet).length;
      const ratio = matches / priorSets.length;
      if (ratio >= settings.rotationThreshold && settings.rotationMode !== "information") {
        alerts.push({
          ruleCode: "ROTATION_WARNING",
          severity: settings.rotationMode === "block" ? "blocking" : "warning",
          message: "Rotation insuffisante des jours de télétravail. Merci de varier vos journées.",
        });
      } else if (ratio >= settings.rotationThreshold) {
        alerts.push({
          ruleCode: "ROTATION_WARNING",
          severity: "info",
          message: "Rotation insuffisante des jours de télétravail. Merci de varier vos journées.",
        });
      }
    }
  }

  if (settings.submissionDeadlineEnabled && input.now) {
    const deadlinePassed = isDeadlinePassed(input.weekStart, input.now, settings);
    if (deadlinePassed) {
      alerts.push({
        ruleCode: "SUBMISSION_DEADLINE_PASSED",
        severity: settings.submissionDeadlineMode === "block" ? "blocking" : "warning",
        message: "La date limite de soumission pour cette semaine est dépassée",
      });
    }
  }

  const blockingAlert = alerts.some((a) => a.severity === "blocking");

  let compliance: WeekCompliance = "compliant";
  if (blockingAlert) compliance = "non_compliant";
  else if (alerts.some((a) => a.severity === "warning")) compliance = "warning";

  const canSubmit = !blockingAlert;

  return { days, selectedCount: selected.size, quota, compliance, alerts, canSubmit };
}

function hasConsecutive(dates: string[], selected: Set<string>): boolean {
  for (let i = 0; i < dates.length - 1; i++) {
    if (selected.has(dates[i]!) && selected.has(dates[i + 1]!)) return true;
  }
  return false;
}

function isDeadlinePassed(weekStart: string, nowIso: string, settings: RuleSettings): boolean {
  // La date limite s'applique à la semaine SUIVANTE : elle porte sur la
  // semaine dont `weekStart` est le lundi, et est fixée un jour de la
  // semaine PRÉCÉDENTE (p.ex. jeudi 18h avant le lundi suivant).
  const deadlineDate = addDaysStr(weekStart, settings.submissionDeadlineWeekday - 7);
  const deadline = new Date(`${deadlineDate}T00:00:00`);
  deadline.setHours(settings.submissionDeadlineHour, 0, 0, 0);
  return new Date(nowIso).getTime() > deadline.getTime();
}

export function evaluateTeamPresence(
  dates: string[],
  countsByDate: Record<string, { officeCount: number; totalCount: number }>,
  settings: Pick<RuleSettings, "teamPresenceMinPercent" | "teamPresenceMode">
): TeamPresenceDay[] {
  return dates.map((date) => {
    const c = countsByDate[date] ?? { officeCount: 0, totalCount: 0 };
    const officePercent = c.totalCount === 0 ? 100 : Math.round((c.officeCount / c.totalCount) * 100);
    return {
      date,
      officePercent,
      officeCount: c.officeCount,
      totalCount: c.totalCount,
      belowThreshold: settings.teamPresenceMode !== "disabled" && officePercent < settings.teamPresenceMinPercent,
    };
  });
}

export function defaultEmployeeContext(
  employeeId: string,
  employeeType: "internal" | "external",
  settings: RuleSettings,
  individualOverride?: number | null
): EmployeeContext {
  return {
    employeeId,
    employeeType,
    weeklyQuota: resolveWeeklyQuota(employeeType, settings, individualOverride),
  };
}
