import { toZonedTime, format as formatTz } from "date-fns-tz";
import { addDays, parseISO } from "date-fns";

export const APP_TIMEZONE = "Africa/Casablanca";

/** Date civile ("yyyy-MM-dd") du jour courant dans le fuseau Africa/Casablanca. */
export function todayInCasablanca(now: Date = new Date()): string {
  return formatTz(toZonedTime(now, APP_TIMEZONE), "yyyy-MM-dd", { timeZone: APP_TIMEZONE });
}

/** Horodatage ISO courant, utilisé par le moteur de règles (date limite de soumission). */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** Lundi (yyyy-MM-dd) de la semaine ISO contenant `dateStr`. */
export function mondayOf(dateStr: string): string {
  const d = parseISO(dateStr);
  const jsDay = d.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const monday = addDays(d, 1 - isoDay);
  return formatDateOnly(monday);
}

export function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentWeekStart(now: Date = new Date()): string {
  return mondayOf(todayInCasablanca(now));
}

export function addWeeks(weekStart: string, count: number): string {
  return formatDateOnly(addDays(parseISO(weekStart), count * 7));
}

/** Lundis (yyyy-MM-dd) des semaines qui recoupent le mois "yyyy-MM" donné. */
export function monthWeeks(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const firstOfMonth = new Date(year!, monthNum! - 1, 1);
  const lastOfMonth = new Date(year!, monthNum!, 0);
  const weeks: string[] = [];
  let cursor = mondayOf(formatDateOnly(firstOfMonth));
  const lastMonday = mondayOf(formatDateOnly(lastOfMonth));
  while (cursor <= lastMonday) {
    weeks.push(cursor);
    cursor = addWeeks(cursor, 1);
  }
  return weeks;
}

export function currentMonth(now: Date = new Date()): string {
  const today = todayInCasablanca(now);
  return today.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const d = new Date(year!, monthNum! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
