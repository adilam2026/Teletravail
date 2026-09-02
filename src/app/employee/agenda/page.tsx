import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEmployeeMonth } from "@/lib/data/planning";
import { currentMonth, shiftMonth } from "@/lib/date/casablanca";
import { MonthWeekCard } from "@/components/calendar/MonthWeekCard";

function weekRangeLabel(weekStart: string, dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleDateString("fr-FR", { month: "long" });
  const endMonth = end.toLocaleDateString("fr-FR", { month: "long" });
  return startMonth === endMonth ? `${startDay} – ${endDay} ${endMonth}` : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { profile } = await requireUser();
  const params = await searchParams;
  const month = params.month ?? currentMonth();

  const supabase = await createClient();
  const { weeks } = await loadEmployeeMonth(supabase, profile, month);

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const validatedCount = weeks.filter((w) => w.plan.status === "validated").length;
  const pendingCount = weeks.filter((w) => w.plan.status === "submitted").length;
  const draftCount = weeks.filter((w) => w.plan.status === "draft" || w.plan.status === "needs_changes").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Saisie télétravail</h1>
          <p className="mt-1 text-sm text-slate-500">Saisissez et soumettez vos jours de télétravail semaine par semaine.</p>
          <p className="mt-1 text-xs text-slate-400">
            {validatedCount} semaine{validatedCount > 1 ? "s" : ""} validée{validatedCount > 1 ? "s" : ""} · {pendingCount} en attente ·{" "}
            {draftCount} brouillon{draftCount > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Link href={`/employee/agenda?month=${shiftMonth(month, -1)}`} className="btn-secondary" aria-label="Mois précédent">
              ‹
            </Link>
            <span className="min-w-[10rem] text-center text-base font-semibold capitalize text-slate-900">{monthLabel}</span>
            <Link href={`/employee/agenda?month=${shiftMonth(month, 1)}`} className="btn-secondary" aria-label="Mois suivant">
              ›
            </Link>
          </div>
          <Link href="/employee/absences" className="btn-secondary whitespace-nowrap">
            + Ajouter une absence
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {weeks.map((week) => (
          <MonthWeekCard
            key={week.weekStart}
            weekStart={week.weekStart}
            rangeLabel={weekRangeLabel(week.weekStart, week.result.days.map((d) => d.date))}
            planId={week.plan.id}
            initialStatus={week.plan.status}
            managerComment={week.plan.manager_comment}
            evaluationInput={week.evaluationInput}
            badges={week.badges}
          />
        ))}
        {weeks.length === 0 && <p className="card text-center text-sm text-slate-400">Aucune semaine pour ce mois.</p>}
      </div>
    </div>
  );
}
