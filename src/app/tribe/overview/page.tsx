import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMembersForTribe, getTribeLedBy, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { StatusBadge } from "@/components/StatusBadge";
import { QuickDecisionButton } from "@/components/validation/QuickDecisionButton";
import { EditProfileButton, type SquadOption } from "@/components/admin/EditProfileButton";
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
  // Toutes les Squads de la Tribe : un Tribe Lead peut réaffecter un
  // collaborateur d'une Squad à l'autre au sein de sa propre Tribe
  // (section 1-2 du cahier des charges — pas besoin du préfixe DU/Tribe
  // dans le libellé, elles appartiennent toutes à la même Tribe).
  const tribeSquadOptions: SquadOption[] = squads.map((s) => ({ id: s.id, label: s.name }));

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
                <MemberRow employeeId={lead.id} firstName={lead.first_name} lastName={lead.last_name} sub="Squad Lead" week={weekByMember.get(lead.id)} />
              )}
              {squadMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  employeeId={m.id}
                  firstName={m.first_name}
                  lastName={m.last_name}
                  sub={m.employee_type === "internal" ? "Interne" : "Externe"}
                  week={weekByMember.get(m.id)}
                  squadOptions={tribeSquadOptions}
                  currentSquadId={squad.id}
                />
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

function MemberRow({
  employeeId,
  firstName,
  lastName,
  sub,
  week,
  squadOptions,
  currentSquadId,
}: {
  employeeId: string;
  firstName: string;
  lastName: string;
  sub: string;
  week?: { planId: string | null; status: PlanStatus | "not_submitted"; days: { date: string; icon: string; label: string }[] };
  squadOptions?: SquadOption[];
  currentSquadId?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div>
        <EditProfileButton userId={employeeId} firstName={firstName} lastName={lastName} squadOptions={squadOptions} currentSquadId={currentSquadId} />
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
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
        {week?.status === "submitted" && week.planId && <QuickDecisionButton planId={week.planId} />}
        <Link href={`/team/${employeeId}/agenda`} className="btn-secondary px-3 py-1.5 text-xs">
          Modifier
        </Link>
      </div>
    </div>
  );
}
