import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEmployeeMonth } from "@/lib/data/planning";
import { resolveTargetProfile } from "@/lib/data/hierarchy";
import { currentMonth, shiftMonth } from "@/lib/date/casablanca";
import { MonthWeekCard } from "@/components/calendar/MonthWeekCard";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

function weekRangeLabel(dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleDateString("fr-FR", { month: "long" });
  const endMonth = end.toLocaleDateString("fr-FR", { month: "long" });
  return startMonth === endMonth ? `${startDay} – ${endDay} ${endMonth}` : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

/**
 * Un supérieur prépare/ajuste le mois complet d'un rattaché (section 14-19
 * et 19 "vue mensuelle manager") : même écran mensuel multi-semaines que
 * l'agenda personnel, seule l'autorisation change, portée par
 * `resolveTargetProfile` (RLS `is_superior_of`, jamais uniquement l'UI).
 */
export default async function TeamMemberAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { profile: actor } = await requireUser();
  const { employeeId } = await params;
  if (employeeId === actor.id) redirect("/employee/agenda");

  const sp = await searchParams;
  const month = sp.month ?? currentMonth();
  const supabase = await createClient();

  const { profile: target } = await resolveTargetProfile(supabase, actor, employeeId);
  if (!target) notFound();

  const { weeks } = await loadEmployeeMonth(supabase, target, month);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="card border-brand-200 bg-brand-50">
        <p className="text-sm font-semibold text-brand-800">
          Planning de {target.first_name} {target.last_name} ({ROLE_LABELS[target.role] ?? target.role})
        </p>
        <p className="mt-1 text-sm text-brand-700">
          Vous consultez et pouvez modifier ce planning en tant que {ROLE_LABELS[actor.role] ?? actor.role}. Toute modification est
          identifiée comme faite par vous, jamais par {target.first_name}.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          Planning — {target.first_name} {target.last_name}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/team/${target.id}/agenda?month=${shiftMonth(month, -1)}`} className="btn-secondary" aria-label="Mois précédent">
            ‹
          </Link>
          <span className="min-w-[10rem] text-center text-base font-semibold capitalize text-slate-900">{monthLabel}</span>
          <Link href={`/team/${target.id}/agenda?month=${shiftMonth(month, 1)}`} className="btn-secondary" aria-label="Mois suivant">
            ›
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {weeks.map((week) => (
          <MonthWeekCard
            key={week.weekStart}
            weekStart={week.weekStart}
            rangeLabel={weekRangeLabel(week.result.days.map((d) => d.date))}
            planId={week.plan.id}
            initialStatus={week.plan.status}
            managerComment={week.plan.manager_comment}
            evaluationInput={week.evaluationInput}
            badges={week.badges}
            targetEmployeeId={target.id}
          />
        ))}
        {weeks.length === 0 && <p className="card text-center text-sm text-slate-400">Aucune semaine pour ce mois.</p>}
      </div>
    </div>
  );
}
