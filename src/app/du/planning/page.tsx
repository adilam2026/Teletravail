import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getStructureForDu, getDuLedBy, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { weekDates } from "@/lib/rules-engine/calendar";
import { TeamPlanningBoard, type TeamPlanningMember } from "@/components/manager/TeamPlanningBoard";

function weekRangeLabel(dates: string[]): string {
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[4]}T00:00:00`);
  return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}

/**
 * "Planning équipe" du Responsable DU (section 3-21 du cahier des charges
 * "vue manager") : descente progressive DU → Tribe → Squad, sans jamais
 * afficher toute l'organisation d'un coup (section 18) — une Tribe est
 * toujours sélectionnée (la première par défaut), avec la possibilité de
 * resserrer sur une Squad. Même composant que Squad Lead / Tribe Lead.
 */
export default async function DuPlanningPage({ searchParams }: { searchParams: Promise<{ week?: string; tribe?: string; squad?: string }> }) {
  const { profile } = await requireRole("du_head");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const du = await getDuLedBy(supabase, profile.id);
  const { tribes, squads, squadLeads, members } = du
    ? await getStructureForDu(supabase, du.id)
    : { tribes: [], squads: [], squadLeads: [], members: [] };

  const selectedTribeId = (params.tribe && tribes.some((t) => t.id === params.tribe) ? params.tribe : tribes[0]?.id) ?? null;
  const tribeSquads = selectedTribeId ? squads.filter((s) => s.tribe_id === selectedTribeId) : [];
  const tribeSquadIds = new Set(tribeSquads.map((s) => s.id));
  const squadNameById = new Map(squads.map((s) => [s.id, s.name]));
  const squadByLeadId = new Map(squads.filter((s) => s.manager_id).map((s) => [s.manager_id!, s]));

  const selectedSquadId = params.squad && params.squad !== "all" ? params.squad : null;
  const scopeMembers = !selectedTribeId
    ? []
    : selectedSquadId
      ? [...squadLeads.filter((l) => squadByLeadId.get(l.id)?.id === selectedSquadId), ...members.filter((m) => m.squad_id === selectedSquadId)]
      : [...squadLeads.filter((l) => tribeSquads.some((s) => s.manager_id === l.id)), ...members.filter((m) => m.squad_id && tribeSquadIds.has(m.squad_id))];

  const overview = await loadGroupWeek(supabase, scopeMembers, weekStart);
  const dates = weekDates(weekStart);

  const boardMembers: TeamPlanningMember[] = overview.members.map((m) => ({
    employeeId: m.profile.id,
    firstName: m.profile.first_name,
    lastName: m.profile.last_name,
    role: m.profile.role,
    employeeType: m.profile.employee_type,
    squadName: m.profile.squad_id ? squadNameById.get(m.profile.squad_id) ?? null : squadByLeadId.get(m.profile.id)?.name ?? null,
    planId: m.planId,
    status: m.status,
    managerComment: m.managerComment,
    days: m.days,
  }));

  const tribeQuery = selectedTribeId ? `&tribe=${selectedTribeId}` : "";
  const squadQuery = selectedSquadId ? `&squad=${selectedSquadId}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning équipe</h1>
          <p className="text-sm text-slate-500">{du ? du.name : "Aucune DU rattachée"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/du/planning?week=${addWeeks(weekStart, -1)}${tribeQuery}${squadQuery}`} className="btn-secondary" aria-label="Semaine précédente">
            ‹
          </Link>
          <span className="min-w-[13rem] text-center text-base font-semibold capitalize text-slate-900">{weekRangeLabel(dates)}</span>
          <Link href={`/du/planning?week=${addWeeks(weekStart, 1)}${tribeQuery}${squadQuery}`} className="btn-secondary" aria-label="Semaine suivante">
            ›
          </Link>
        </div>
      </div>

      {tribes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tribes.map((t) => (
            <Link
              key={t.id}
              href={`/du/planning?week=${weekStart}&tribe=${t.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedTribeId === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {tribeSquads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/du/planning?week=${weekStart}${tribeQuery}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!selectedSquadId ? "bg-brand-100 text-brand-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
          >
            Toutes les Squads
          </Link>
          {tribeSquads.map((s) => (
            <Link
              key={s.id}
              href={`/du/planning?week=${weekStart}${tribeQuery}&squad=${s.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedSquadId === s.id ? "bg-brand-100 text-brand-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {selectedTribeId ? (
        <TeamPlanningBoard members={boardMembers} presence={overview.presence} />
      ) : (
        <p className="card text-center text-sm text-slate-400">Aucune Tribe rattachée à votre DU.</p>
      )}
    </div>
  );
}
