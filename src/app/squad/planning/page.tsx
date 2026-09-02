import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSquadLedBy, getSquadMembers, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { weekDates } from "@/lib/rules-engine/calendar";
import { TeamPlanningBoard, type TeamPlanningMember } from "@/components/manager/TeamPlanningBoard";

function weekRangeLabel(dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}

/**
 * "Planning équipe" du Squad Lead (section 3-19 du cahier des charges "vue
 * manager") : le collaborateur voit et valide directement depuis cette même
 * vue — plus besoin d'ouvrir chaque demande sur un écran séparé.
 */
export default async function SquadPlanningPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { profile } = await requireRole("squad_lead");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const squad = await getSquadLedBy(supabase, profile.id);
  const members = squad ? await getSquadMembers(supabase, squad.id) : [];
  const overview = await loadGroupWeek(supabase, members, weekStart);
  const dates = weekDates(weekStart);

  const boardMembers: TeamPlanningMember[] = overview.members.map((m) => ({
    employeeId: m.profile.id,
    firstName: m.profile.first_name,
    lastName: m.profile.last_name,
    role: m.profile.role,
    employeeType: m.profile.employee_type,
    squadName: null,
    planId: m.planId,
    status: m.status,
    managerComment: m.managerComment,
    days: m.days,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning équipe</h1>
          <p className="text-sm text-slate-500">{squad ? squad.name : "Aucune Squad rattachée"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/squad/planning?week=${addWeeks(weekStart, -1)}`} className="btn-secondary" aria-label="Semaine précédente">
            ‹
          </Link>
          <span className="min-w-[13rem] text-center text-base font-semibold capitalize text-slate-900">{weekRangeLabel(dates)}</span>
          <Link href={`/squad/planning?week=${addWeeks(weekStart, 1)}`} className="btn-secondary" aria-label="Semaine suivante">
            ›
          </Link>
        </div>
      </div>

      <TeamPlanningBoard members={boardMembers} presence={overview.presence} />
    </div>
  );
}
