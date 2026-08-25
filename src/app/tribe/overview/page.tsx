import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMembersForTribe, getTribeLedBy, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus } from "@/lib/supabase/database.types";

export default async function TribeOverviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { profile } = await requireRole("tribe_lead");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const tribe = await getTribeLedBy(supabase, profile.id);
  const { squads, squadLeads, members } = tribe
    ? await getMembersForTribe(supabase, tribe.id)
    : { squads: [], squadLeads: [], members: [] };

  const allWeekMembers = [...squadLeads, ...members];
  const overview = await loadGroupWeek(supabase, allWeekMembers, weekStart);
  const weekByMember = new Map(overview.members.map((m) => [m.profile.id, m]));
  const squadLeadById = new Map(squadLeads.map((l) => [l.id, l]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ma Tribe</h1>
          <p className="text-sm text-slate-500">{tribe ? tribe.name : "Aucune Tribe rattachée"} · Semaine du {weekStart}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/tribe/overview?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Semaine précédente
          </Link>
          <Link href={`/tribe/overview?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Semaine suivante →
          </Link>
        </div>
      </div>

      {squads.map((squad) => {
        const lead = squad.manager_id ? squadLeadById.get(squad.manager_id) : null;
        const squadMembers = members.filter((m) => m.squad_id === squad.id);
        return (
          <div key={squad.id} className="card p-0 overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">{squad.name}</p>
              <p className="text-xs text-slate-400">{lead ? `${lead.first_name} ${lead.last_name} — Squad Lead` : "Aucun Squad Lead"}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {lead && (
                <MemberRow name={`${lead.first_name} ${lead.last_name}`} sub="Squad Lead" week={weekByMember.get(lead.id)} />
              )}
              {squadMembers.map((m) => (
                <MemberRow key={m.id} name={`${m.first_name} ${m.last_name}`} sub={m.employee_type === "internal" ? "Interne" : "Externe"} week={weekByMember.get(m.id)} />
              ))}
              {squadMembers.length === 0 && !lead && <p className="px-5 py-4 text-sm text-slate-400">Aucun membre.</p>}
            </div>
          </div>
        );
      })}
      {squads.length === 0 && <p className="text-sm text-slate-400">Aucune Squad rattachée à votre Tribe.</p>}
    </div>
  );
}

function MemberRow({ name, sub, week }: { name: string; sub: string; week?: { status: PlanStatus | "not_submitted"; days: { date: string; icon: string; label: string }[] } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{name}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex gap-1 text-lg">
          {(week?.days ?? []).map((d) => (
            <span key={d.date} title={d.label}>
              {d.icon}
            </span>
          ))}
        </div>
        {week ? (
          week.status === "not_submitted" ? (
            <span className="badge bg-slate-100 text-slate-500">⚪ Non soumise</span>
          ) : (
            <StatusBadge status={week.status as PlanStatus} />
          )
        ) : null}
      </div>
    </div>
  );
}
