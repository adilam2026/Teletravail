export * from "./types";
export * from "./calendar";
export * from "./engine";

import type { RuleSettings } from "./types";

/** Valeurs de secours si une clé n'existe pas encore en base (nouvelle installation). */
export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  quotaInternal: 2,
  quotaExternal: 1,
  consecutiveDaysForbidden: true,
  mondayFridayForbidden: true,
  fridayMondayBridgeForbidden: true,
  returnAfterAbsenceForbidden: true,
  returnAfterBridgeEnabled: true,
  rotationEnabled: true,
  rotationWeeks: 4,
  rotationThreshold: 0.75,
  rotationMode: "alert",
  teamPresenceMinPercent: 50,
  teamPresenceMode: "alert",
  submissionDeadlineEnabled: false,
  submissionDeadlineWeekday: 4,
  submissionDeadlineHour: 18,
  submissionDeadlineMode: "block",
};

/** Convertit les lignes clé/valeur (jsonb) de `telework_rules` en RuleSettings typé. */
export function parseRuleSettings(rows: { key: string; value: unknown }[]): RuleSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = map.get(key);
    return typeof v === "number" ? v : fallback;
  };
  const bool = (key: string, fallback: boolean) => {
    const v = map.get(key);
    return typeof v === "boolean" ? v : fallback;
  };
  const str = <T extends string>(key: string, fallback: T) => {
    const v = map.get(key);
    return typeof v === "string" ? (v as T) : fallback;
  };

  return {
    quotaInternal: num("quota_internal", DEFAULT_RULE_SETTINGS.quotaInternal),
    quotaExternal: num("quota_external", DEFAULT_RULE_SETTINGS.quotaExternal),
    consecutiveDaysForbidden: bool("consecutive_days_forbidden", DEFAULT_RULE_SETTINGS.consecutiveDaysForbidden),
    mondayFridayForbidden: bool("monday_friday_forbidden", DEFAULT_RULE_SETTINGS.mondayFridayForbidden),
    fridayMondayBridgeForbidden: bool("friday_monday_bridge_forbidden", DEFAULT_RULE_SETTINGS.fridayMondayBridgeForbidden),
    returnAfterAbsenceForbidden: bool(
      "return_after_absence_forbidden",
      DEFAULT_RULE_SETTINGS.returnAfterAbsenceForbidden
    ),
    returnAfterBridgeEnabled: bool("return_after_bridge_enabled", DEFAULT_RULE_SETTINGS.returnAfterBridgeEnabled),
    rotationEnabled: bool("rotation_enabled", DEFAULT_RULE_SETTINGS.rotationEnabled),
    rotationWeeks: num("rotation_weeks", DEFAULT_RULE_SETTINGS.rotationWeeks),
    rotationThreshold: num("rotation_threshold", DEFAULT_RULE_SETTINGS.rotationThreshold),
    rotationMode: str("rotation_mode", DEFAULT_RULE_SETTINGS.rotationMode),
    teamPresenceMinPercent: num("team_presence_min_percent", DEFAULT_RULE_SETTINGS.teamPresenceMinPercent),
    teamPresenceMode: str("team_presence_mode", DEFAULT_RULE_SETTINGS.teamPresenceMode),
    submissionDeadlineEnabled: bool(
      "submission_deadline_enabled",
      DEFAULT_RULE_SETTINGS.submissionDeadlineEnabled
    ),
    submissionDeadlineWeekday: num(
      "submission_deadline_weekday",
      DEFAULT_RULE_SETTINGS.submissionDeadlineWeekday
    ),
    submissionDeadlineHour: num("submission_deadline_hour", DEFAULT_RULE_SETTINGS.submissionDeadlineHour),
    submissionDeadlineMode: str("submission_deadline_mode", DEFAULT_RULE_SETTINGS.submissionDeadlineMode),
  };
}
