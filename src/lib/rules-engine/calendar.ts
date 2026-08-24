import { addDays, format, parseISO } from "date-fns";
import type { HolidayDate } from "./types";

/** Lundi=1 ... dimanche=7 (ISO), calculé à partir d'une date civile "yyyy-MM-dd". */
export function isoWeekday(dateStr: string): number {
  const d = parseISO(dateStr);
  const jsDay = d.getDay(); // 0=dimanche ... 6=samedi
  return jsDay === 0 ? 7 : jsDay;
}

export function isWeekend(dateStr: string): boolean {
  const wd = isoWeekday(dateStr);
  return wd === 6 || wd === 7;
}

export function addDaysStr(dateStr: string, days: number): string {
  return format(addDays(parseISO(dateStr), days), "yyyy-MM-dd");
}

export function isHoliday(dateStr: string, holidays: HolidayDate[]): boolean {
  return holidays.some((h) => h.date === dateStr);
}

export function findHoliday(dateStr: string, holidays: HolidayDate[]): HolidayDate | undefined {
  return holidays.find((h) => h.date === dateStr);
}

/** Les 5 dates (lundi->vendredi) de la semaine dont `weekStart` est le lundi. */
export function weekDates(weekStart: string): string[] {
  return [0, 1, 2, 3, 4].map((offset) => addDaysStr(weekStart, offset));
}

export const WEEKDAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;

/**
 * Premier jour ouvré strictement après `fromDate` (exclusif), en sautant les
 * week-ends et, si `skipHolidays`, les jours fériés (utilisé pour la règle de
 * reprise après absence qui doit franchir un pont week-end/férié).
 */
export function nextWorkingDay(
  fromDate: string,
  holidays: HolidayDate[],
  skipHolidays: boolean
): string {
  let d = fromDate;
  // Sécurité anti-boucle infinie : 30 jours suffisent largement.
  for (let i = 0; i < 30; i++) {
    if (!isWeekend(d) && !(skipHolidays && isHoliday(d, holidays))) {
      return d;
    }
    d = addDaysStr(d, 1);
  }
  return d;
}
