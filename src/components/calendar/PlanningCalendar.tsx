import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import type { WeekEvaluationResult } from "@/lib/rules-engine/types";
import type { DayBadge, EmployeeMonthWeek } from "@/lib/data/planning";
import { StatusBadge } from "@/components/StatusBadge";

interface PlanningCell {
  date: string;
  icon: string;
  label: string;
  tone: string;
}

function formatDayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/**
 * Un seul mapping jour -> icône/libellé/couleur, partagé par les deux
 * variantes de rendu (table desktop, liste mobile) — jamais recalculé
 * différemment selon la largeur d'écran (section 3-9 du cahier des charges).
 * Volontairement distinct des couleurs de `MonthWeekCard`/`PlanningWeekCard`
 * (pas de bordure, pas de survol) : rien ici ne doit ressembler à un champ
 * cliquable de "Mon agenda".
 */
function resolvePlanningCell(day: WeekEvaluationResult["days"][number], badge: DayBadge | null): PlanningCell {
  if (day.selected) return { date: day.date, icon: "🏠", label: "Télétravail", tone: "bg-brand-50 text-brand-700" };

  if (badge) {
    if (badge.kind === "holiday_national" || badge.kind === "holiday_religious") {
      return { date: day.date, icon: badge.icon, label: "Jour férié", tone: "bg-red-50 text-red-700" };
    }
    if (badge.kind === "absence_sick") return { date: day.date, icon: badge.icon, label: badge.label, tone: "bg-rose-50 text-rose-700" };
    if (badge.kind === "absence_leave") return { date: day.date, icon: badge.icon, label: badge.label, tone: "bg-emerald-50 text-emerald-700" };
    if (badge.kind === "absence_other") return { date: day.date, icon: badge.icon, label: badge.label, tone: "bg-slate-100 text-slate-600" };
    return { date: day.date, icon: badge.icon, label: badge.label, tone: "bg-amber-50 text-amber-700" };
  }

  if (day.allowed) return { date: day.date, icon: "🏢", label: "Bureau", tone: "bg-white text-slate-500" };

  return { date: day.date, icon: "📌", label: "Présence obligatoire", tone: "bg-slate-100 text-slate-500" };
}

function weekRangeLabel(dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  const startMonth = start.toLocaleDateString("fr-FR", { month: "long" });
  const endMonth = end.toLocaleDateString("fr-FR", { month: "long" });
  return startMonth === endMonth
    ? `${start.getDate()} – ${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

const LEGEND: { icon: string; label: string }[] = [
  { icon: "🏠", label: "Télétravail" },
  { icon: "🏢", label: "Bureau" },
  { icon: "🌴", label: "Absence" },
  { icon: "🇲🇦", label: "Jour férié" },
];

/**
 * Vue mensuelle consolidée en pure consultation (section 3-11 du cahier des
 * charges "différencier Mon agenda / Planning") : une table calendrier sur
 * desktop, une liste compacte sur mobile — jamais la même mise en page que
 * `MonthWeekCard` (pas de cartes, pas de bouton, pas de quota par semaine),
 * pour qu'aucune ambiguïté ne subsiste sur "ici je regarde, je ne saisis
 * pas". Le statut de la semaine (brouillon/en attente/validée/à modifier)
 * n'apparaît qu'une fois par ligne, jamais répété jour par jour.
 */
export function PlanningCalendar({ weeks }: { weeks: EmployeeMonthWeek[] }) {
  const rows = weeks.map((week) => ({
    weekStart: week.weekStart,
    status: week.plan.status,
    cells: week.result.days.map((day) => resolvePlanningCell(day, week.badges[day.date] ?? null)),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <span>{l.icon}</span> {l.label}
          </span>
        ))}
      </div>

      {/* Desktop : vraie table calendrier, une ligne par semaine. */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-100 sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-40 px-4 py-2 text-left">Semaine</th>
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} className="px-2 py-2 text-center">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.weekStart}>
                <td className="px-4 py-3 align-middle">
                  <p className="text-xs font-semibold capitalize text-slate-700">{weekRangeLabel(row.cells.map((c) => c.date))}</p>
                  <div className="mt-1">
                    <StatusBadge status={row.status} />
                  </div>
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.date} className="p-1.5 align-middle">
                    <div className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center ${cell.tone}`}>
                      <span className="text-[10px] font-medium text-slate-400">{formatDayNumber(cell.date)}</span>
                      <span className="text-base leading-none">{cell.icon}</span>
                      <span className="text-[11px] font-medium leading-tight">{cell.label}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : liste compacte par semaine, jamais une grille de cartes. */}
      <div className="space-y-4 sm:hidden">
        {rows.map((row) => (
          <div key={row.weekStart} className="rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold capitalize text-slate-800">{weekRangeLabel(row.cells.map((c) => c.date))}</p>
              <StatusBadge status={row.status} />
            </div>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {row.cells.map((cell, idx) => (
                <div key={cell.date} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-slate-500">
                    {WEEKDAY_LABELS[idx]} {formatDayNumber(cell.date)}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                    <span>{cell.icon}</span> {cell.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
