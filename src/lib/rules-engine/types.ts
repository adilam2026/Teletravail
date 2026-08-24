/**
 * Types du moteur de règles télétravail.
 * Toutes les dates sont des chaînes "yyyy-MM-dd" déjà résolues dans le
 * calendrier civil Africa/Casablanca par l'appelant (voir src/lib/date).
 */

export type RuleCode =
  | "MAX_WEEKLY_QUOTA"
  | "CONSECUTIVE_REMOTE_DAYS"
  | "MONDAY_FRIDAY_COMBINATION"
  | "RETURN_AFTER_ABSENCE"
  | "PUBLIC_HOLIDAY"
  | "MANDATORY_OFFICE_DAY"
  | "TELEWORK_SUSPENDED"
  | "SUBMISSION_DEADLINE_PASSED"
  | "WEEK_LOCKED"
  | "ROTATION_WARNING"
  | "TEAM_PRESENCE_WARNING";

export type Severity = "blocking" | "warning" | "info";

export type EmployeeTypeCode = "internal" | "external";

export type ExceptionTypeCode =
  | "mandatory_office"
  | "telework_forbidden"
  | "telework_allowed"
  | "site_closure"
  | "company_event"
  | "seminar"
  | "custom_period";

export type RotationMode = "information" | "alert" | "block";
export type PresenceMode = "disabled" | "alert" | "block";
export type DeadlineMode = "alert" | "block";

export interface RuleSettings {
  quotaInternal: number;
  quotaExternal: number;
  consecutiveDaysForbidden: boolean;
  mondayFridayForbidden: boolean;
  returnAfterAbsenceForbidden: boolean;
  returnAfterBridgeEnabled: boolean;
  rotationEnabled: boolean;
  rotationWeeks: number;
  rotationThreshold: number;
  rotationMode: RotationMode;
  teamPresenceMinPercent: number;
  teamPresenceMode: PresenceMode;
  submissionDeadlineEnabled: boolean;
  submissionDeadlineWeekday: number; // 1=lundi ... 7=dimanche
  submissionDeadlineHour: number;
  submissionDeadlineMode: DeadlineMode;
}

export interface EmployeeContext {
  employeeId: string;
  employeeType: EmployeeTypeCode;
  /** Quota déjà résolu : override individuel actif sinon quota standard du type. */
  weeklyQuota: number;
}

export interface AbsencePeriod {
  startDate: string;
  endDate: string;
  triggersReturnRule: boolean;
  typeName?: string;
}

export interface HolidayDate {
  date: string;
  name: string;
  status: "provisional" | "confirmed";
}

export interface ExceptionPeriod {
  startDate: string;
  endDate: string;
  type: ExceptionTypeCode;
  name: string;
}

export interface DayEvaluation {
  date: string;
  weekday: number; // 1=lundi ... 5=vendredi
  /** Le collaborateur a-t-il choisi le télétravail ce jour-là ? */
  selected: boolean;
  /** Peut-on sélectionner (ou laisser sélectionné) le télétravail ce jour ? */
  allowed: boolean;
  reason: string | null;
  ruleCode: RuleCode | null;
  severity: Severity | null;
}

export interface WeekAlert {
  ruleCode: RuleCode;
  severity: Severity;
  message: string;
}

export type WeekCompliance = "compliant" | "warning" | "non_compliant";

export interface WeekEvaluationInput {
  /** Lundi de la semaine, "yyyy-MM-dd". */
  weekStart: string;
  /** Jours actuellement sélectionnés en télétravail (sous-ensemble de lun-ven). */
  selectedDates: string[];
  employee: EmployeeContext;
  settings: RuleSettings;
  /** Jours fériés pertinents (semaine courante + marge pour la reprise). */
  holidays: HolidayDate[];
  /** Absences pertinentes (semaine courante + ~10 jours avant pour la reprise). */
  absences: AbsencePeriod[];
  /** Exceptions déjà filtrées par périmètre (entreprise / équipe / collaborateur). */
  exceptions: ExceptionPeriod[];
  /** Jeux de jours (1-5) télétravaillés lors des N semaines précédentes, plus récent en premier. */
  priorWeeksSelections?: number[][];
  /** Horodatage de l'évaluation (pour la date limite de soumission), ISO. */
  now?: string;
}

export interface WeekEvaluationResult {
  days: DayEvaluation[];
  selectedCount: number;
  quota: number;
  compliance: WeekCompliance;
  alerts: WeekAlert[];
  canSubmit: boolean;
}

export interface TeamPresenceDay {
  date: string;
  officePercent: number;
  officeCount: number;
  totalCount: number;
  belowThreshold: boolean;
}
