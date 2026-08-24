import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEmployeeWeek } from "@/lib/data/planning";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { ComplianceBadge, StatusBadge } from "@/components/StatusBadge";
import { toggleTeleworkDay } from "@/lib/actions/weeks";
import { SubmitWeekButton } from "@/components/employee/SubmitWeekButton";
import { ReopenWeekButton } from "@/components/employee/ReopenWeekButton";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { profile } = await requireRole("employee");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();

  const supabase = await createClient();
  const week = await loadEmployeeWeek(supabase, profile, weekStart);

  const editable = week.plan.status === "draft" || week.plan.status === "needs_changes";
  const rangeLabel = `${week.result.days[0]!.date.slice(8, 10)}/${week.result.days[0]!.date.slice(5, 7)} au ${week.result.days[4]!.date.slice(8, 10)}/${week.result.days[4]!.date.slice(5, 7)}`;

  const boundToggle = toggleTeleworkDay.bind(null, weekStart);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mon agenda</h1>
          <p className="text-sm text-slate-500">Semaine du {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/employee/agenda?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Semaine précédente
          </Link>
          <Link href={`/employee/agenda?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Semaine suivante →
          </Link>
          <Link href="/employee/agenda/month" className="btn-secondary">
            Vue mois
          </Link>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={week.plan.status} />
          <ComplianceBadge compliance={week.result.compliance} />
        </div>
        <div className="text-sm font-medium text-slate-600">
          Télétravail : {week.result.selectedCount} / {week.result.quota} jour{week.result.quota > 1 ? "s" : ""}
        </div>
      </div>

      {week.result.alerts.length > 0 && (
        <div className="space-y-2">
          {week.result.alerts.map((alert, idx) => (
            <p
              key={idx}
              className={`rounded-lg px-3 py-2 text-sm ${
                alert.severity === "blocking"
                  ? "bg-rose-50 text-rose-700"
                  : alert.severity === "warning"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {alert.message}
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <WeekGrid days={week.result.days} badges={week.badges} editable={editable} onToggle={boundToggle} />
      </div>

      {week.plan.manager_comment && (week.plan.status === "rejected" || week.plan.status === "needs_changes") && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">Commentaire du manager</p>
          <p className="mt-1 text-sm text-amber-700">{week.plan.manager_comment}</p>
        </div>
      )}

      {week.plan.status === "validated" && (
        <div className="card border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-800">✓ Semaine validée</p>
          <p className="mt-1 text-sm text-emerald-700">
            Vous pouvez maintenant déclarer vos journées de télétravail sur la plateforme RH de votre entreprise.
          </p>
          <div className="mt-3">
            <ReopenWeekButton planId={week.plan.id} />
          </div>
        </div>
      )}

      {editable && (
        <div className="flex justify-end">
          <SubmitWeekButton weekStart={weekStart} canSubmit={week.result.canSubmit} />
        </div>
      )}
    </div>
  );
}
