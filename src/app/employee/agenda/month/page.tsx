import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAbsencesForEmployee, getExceptionsFor, getHolidaysInRange, buildDayBadge } from "@/lib/data/planning";
import { currentMonth, shiftMonth, monthWeeks } from "@/lib/date/casablanca";
import { addDaysStr, weekDates, WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus } from "@/lib/supabase/database.types";

export default async function AgendaMonthPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { profile } = await requireRole("employee");
  const params = await searchParams;
  const month = params.month ?? currentMonth();
  const supabase = await createClient();

  const weeks = monthWeeks(month);
  const rangeStart = weeks[0]!;
  const rangeEnd = addDaysStr(weeks[weeks.length - 1]!, 4);

  const [holidays, absences, exceptions, { data: plans }] = await Promise.all([
    getHolidaysInRange(supabase, rangeStart, rangeEnd),
    getAbsencesForEmployee(supabase, profile.id, rangeStart, rangeEnd),
    getExceptionsFor(supabase, profile.id, profile.team_id, rangeStart, rangeEnd),
    supabase.from("weekly_plans").select("id, week_start, status").eq("employee_id", profile.id).in("week_start", weeks),
  ]);

  const planByWeek = new Map((plans ?? []).map((p) => [p.week_start, p]));
  const planIds = (plans ?? []).map((p) => p.id);
  const { data: days } = planIds.length
    ? await supabase.from("telework_days").select("weekly_plan_id, work_date").in("weekly_plan_id", planIds)
    : { data: [] as { weekly_plan_id: string; work_date: string }[] };
  const teleworkDates = new Set((days ?? []).map((d) => d.work_date));

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold capitalize text-slate-900">{monthLabel}</h1>
          <p className="text-sm text-slate-500">Vue mensuelle</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/employee/agenda/month?month=${shiftMonth(month, -1)}`} className="btn-secondary">
            ← Mois précédent
          </Link>
          <Link href={`/employee/agenda/month?month=${shiftMonth(month, 1)}`} className="btn-secondary">
            Mois suivant →
          </Link>
          <Link href="/employee/agenda" className="btn-secondary">
            Vue semaine
          </Link>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase text-slate-400">
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} className="px-2 py-1 text-left">
                  {label}
                </th>
              ))}
              <th className="px-2 py-1 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((weekStart) => {
              const dates = weekDates(weekStart);
              const plan = planByWeek.get(weekStart);
              return (
                <tr key={weekStart}>
                  {dates.map((date) => {
                    const badge = buildDayBadge(date, holidays, absences, exceptions);
                    const isTelework = teleworkDates.has(date);
                    const icon = badge ? badge.icon : isTelework ? "🏠" : "🏢";
                    return (
                      <td key={date} className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                        <div className="text-xs text-slate-400">{date.slice(8, 10)}</div>
                        <div className="text-lg">{icon}</div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    {plan ? <StatusBadge status={plan.status as PlanStatus} /> : <span className="badge bg-slate-100 text-slate-500">⚪ Brouillon</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
