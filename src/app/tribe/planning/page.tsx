import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMembersForTribe, getTribeLedBy, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { weekDates } from "@/lib/rules-engine/calendar";
import { TeamPlanningBoard, type TeamPlanningMember } from "@/components/manager/TeamPlanningBoard";

function weekRangeLabel(dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}

/**
 * "Planning équipe" du Tribe Lead (section 3-20 du cahier des charges "vue
 * manager") : toute la Tribe par défaut, ou une Squad au choix — même
 * composant que le Squad Lead, seul le périmètre change.
 */
export default async function TribePlanningPage({ searchParams }: { searchParams: Promise<{ week?: string; squad?: string }> }) {
  const { profile } = await requireRole("tribe_lead");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const tribe = await getTribeLedBy(supabase, profile.id);
  const { squads, squadLeads, members } = tribe ? await getMembersForTribe(supabase, tribe.id) : { squads: [], squadLeads: [], members: [] };

  const squadNameById = new Map(squads.map((s) => [s.id, s.name]));
  const squadByLeadId = new Map(squads.filter((s) => s.manager_id).map((s) => [s.manager_id!, s]));

  const selectedSquadId = params.squad && params.squad !== "all" ? params.squad : null;
  const scopeMembers = selectedSquadId
    ? [...squadLeads.filter((l) => squadByLeadId.get(l.id)?.id === selectedSquadId), ...members.filter((m) => m.squad_id === selectedSquadId)]
    : [...squadLeads, ...members];

  const overview = await loadGroupWeek(supabase, scopeMembers, weekStart);
  const dates = weekDates(weekStart);

  const boardMembers: TeamPlanningMember[] = overview.members.map((m) => ({
    employeeId: m.profile.id,
    firstName: m.profile.first_name,
    lastName: m.profile.last_name,
    role: m.profile.role,
    employeeType: m.profile.employee_type,
    squadName: m.profile.squad_id
      ? squadNameById.get(m.profile.squad_id) ?? null
      : squadByLeadId.get(m.profile.id)?.name ?? null,
    planId: m.planId,
    status: m.status,
    managerComment: m.managerComment,
    days: m.days,
  }));

  const squadQuery = selectedSquadId ? `&squad=${selectedSquadId}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning équipe</h1>
          <p className="text-sm text-slate-500">{tribe ? tribe.name : "Aucune Tribe rattachée"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/tribe/planning?week=${addWeeks(weekStart, -1)}${squadQuery}`} className="btn-secondary" aria-label="Semaine précédente">
            ‹
          </Link>
          <span className="min-w-[13rem] text-center text-base font-semibold capitalize text-slate-900">{weekRangeLabel(dates)}</span>
          <Link href={`/tribe/planning?week=${addWeeks(weekStart, 1)}${squadQuery}`} className="btn-secondary" aria-label="Semaine suivante">
            ›
          </Link>
        </div>
      </div>

      {squads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/tribe/planning?week=${weekStart}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!selectedSquadId ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Toutes les Squads
          </Link>
          {squads.map((s) => (
            <Link
              key={s.id}
              href={`/tribe/planning?week=${weekStart}&squad=${s.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedSquadId === s.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      <TeamPlanningBoard members={boardMembers} presence={overview.presence} />
    </div>
  );
}
