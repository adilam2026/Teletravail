import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient, type AppSupabaseClient } from "@/lib/supabase/server";
import { loadTeamWeek } from "@/lib/data/team";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus, ProfileRow, TeamRow } from "@/lib/supabase/database.types";

export default async function AdminPlanningPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole("admin");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const { data: teams } = await supabase.from("teams").select("*").order("name");
  const { data: allMembers } = await supabase.from("profiles").select("*").eq("role", "employee").eq("status", "active");

  const membersByTeam = new Map<string, typeof allMembers>();
  for (const m of allMembers ?? []) {
    if (!m.team_id) continue;
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning global</h1>
          <p className="text-sm text-slate-500">Semaine du {weekStart}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/planning?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Précédente
          </Link>
          <Link href={`/admin/planning?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Suivante →
          </Link>
        </div>
      </div>

      {(teams ?? [])
        .filter((team) => (membersByTeam.get(team.id) ?? []).length > 0)
        .map((team) => (
          <TeamPlanningCard key={team.id} supabase={supabase} team={team} members={membersByTeam.get(team.id) ?? []} weekStart={weekStart} />
        ))}
      {(teams ?? []).length === 0 && <p className="text-sm text-slate-400">Aucune équipe.</p>}
    </div>
  );
}

async function TeamPlanningCard({
  supabase,
  team,
  members,
  weekStart,
}: {
  supabase: AppSupabaseClient;
  team: TeamRow;
  members: ProfileRow[];
  weekStart: string;
}) {
  const overview = await loadTeamWeek(supabase, team, members, weekStart);

  return (
    <div className="card overflow-x-auto p-0">
      <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{team.name}</p>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-slate-400">
            <th className="px-5 py-2">Collaborateur</th>
            {WEEKDAY_LABELS.map((label) => (
              <th key={label} className="px-3 py-2 text-center">
                {label}
              </th>
            ))}
            <th className="px-5 py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {overview.members.map((m) => (
            <tr key={m.profile.id} className="border-t border-slate-50">
              <td className="px-5 py-2 font-medium text-slate-700">
                {m.profile.first_name} {m.profile.last_name}
              </td>
              {m.days.map((d) => (
                <td key={d.date} className="px-3 py-2 text-center text-lg" title={d.label}>
                  {d.icon}
                </td>
              ))}
              <td className="px-5 py-2">
                {m.status === "not_submitted" ? (
                  <span className="badge bg-slate-100 text-slate-500">⚪ Non soumise</span>
                ) : (
                  <StatusBadge status={m.status as PlanStatus} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
