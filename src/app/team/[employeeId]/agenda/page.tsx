import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEmployeeWeek } from "@/lib/data/planning";
import { resolveTargetProfile } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { WeekHistoryButton } from "@/components/calendar/WeekHistoryButton";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

/**
 * Un supérieur prépare/ajuste la semaine d'un rattaché (section 14-19) :
 * même interface que l'agenda personnel (WeekGrid, remplacement
 * intelligent, quota Interne/Externe...), rien n'est dupliqué — seule
 * l'autorisation change, portée par `resolveTargetProfile` (RLS
 * `is_superior_of`, jamais uniquement l'interface).
 */
export default async function TeamMemberAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { profile: actor } = await requireUser();
  const { employeeId } = await params;
  if (employeeId === actor.id) redirect("/employee/agenda");

  const sp = await searchParams;
  const weekStart = sp.week ? mondayOf(sp.week) : currentWeekStart();
  const supabase = await createClient();

  const { profile: target } = await resolveTargetProfile(supabase, actor, employeeId);
  if (!target) notFound();

  const week = await loadEmployeeWeek(supabase, target, weekStart);
  const editable = week.plan.status === "draft" || week.plan.status === "needs_changes" || week.plan.status === "submitted";
  const rangeLabel = `${week.result.days[0]!.date.slice(8, 10)}/${week.result.days[0]!.date.slice(5, 7)} au ${week.result.days[4]!.date.slice(8, 10)}/${week.result.days[4]!.date.slice(5, 7)}`;

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
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Planning — {target.first_name} {target.last_name}
          </h1>
          <p className="text-sm text-slate-500">Semaine du {rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/team/${target.id}/agenda?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Semaine précédente
          </Link>
          <Link href={`/team/${target.id}/agenda?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Semaine suivante →
          </Link>
          <WeekHistoryButton planId={week.plan.id} />
        </div>
      </div>

      <WeekGrid
        weekStart={weekStart}
        planId={week.plan.id}
        evaluationInput={week.evaluationInput}
        badges={week.badges}
        editable={editable}
        planStatus={week.plan.status}
        targetEmployeeId={target.id}
      />

      {week.plan.status === "needs_changes" && week.plan.manager_comment && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">Modification demandée</p>
          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-amber-900">« {week.plan.manager_comment} »</p>
        </div>
      )}
    </div>
  );
}
