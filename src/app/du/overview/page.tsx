import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDuLedBy, getStructureForDu, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { StatusBadge } from "@/components/StatusBadge";
import { QuickDecisionButton } from "@/components/validation/QuickDecisionButton";
import { EditProfileButton, type SquadOption } from "@/components/admin/EditProfileButton";
import type { PlanStatus } from "@/lib/supabase/database.types";

export default async function DuOverviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { profile } = await requireRole("du_head");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const du = await getDuLedBy(supabase, profile.id);
  const { tribes, tribeLeads, squads, squadLeads, members } = du
    ? await getStructureForDu(supabase, du.id)
    : { tribes: [], tribeLeads: [], squads: [], squadLeads: [], members: [] };

  const allWeekMembers = [...tribeLeads, ...squadLeads, ...members];
  const overview = await loadGroupWeek(supabase, allWeekMembers, weekStart);
  const weekByMember = new Map(overview.members.map((m) => [m.profile.id, m]));
  const tribeLeadById = new Map(tribeLeads.map((l) => [l.id, l]));
  const squadLeadById = new Map(squadLeads.map((l) => [l.id, l]));
  const tribeById = new Map(tribes.map((t) => [t.id, t]));
  // Toutes les Squads de la DU (toutes Tribes confondues) : un Responsable
  // DU peut réaffecter un collaborateur d'une Squad/Tribe à l'autre au sein
  // de sa propre DU (section 1-2 du cahier des charges).
  const duSquadOptions: SquadOption[] = squads.map((s) => {
    const tribeName = tribeById.get(s.tribe_id)?.name;
    return { id: s.id, label: [tribeName, s.name].filter(Boolean).join(" / ") };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ma DU</h1>
          <p className="text-sm text-slate-500">{du ? du.name : "Aucune DU rattachée"} · Semaine du {weekStart}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/du/overview?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Semaine précédente
          </Link>
          <Link href={`/du/overview?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Semaine suivante →
          </Link>
        </div>
      </div>

      {tribes.map((tribe) => {
        const tribeLead = tribe.manager_id ? tribeLeadById.get(tribe.manager_id) : null;
        const tribeSquads = squads.filter((s) => s.tribe_id === tribe.id);
        return (
          <div key={tribe.id} className="card space-y-4">
            <div>
              <p className="text-base font-semibold text-slate-900">{tribe.name}</p>
              <p className="text-xs text-slate-400">{tribeLead ? `${tribeLead.first_name} ${tribeLead.last_name} — Tribe Lead` : "Aucun Tribe Lead"}</p>
            </div>

            <div className="space-y-3">
              {tribeSquads.map((squad) => {
                const squadLead = squad.manager_id ? squadLeadById.get(squad.manager_id) : null;
                const squadMembers = members.filter((m) => m.squad_id === squad.id);
                return (
                  <div key={squad.id} className="rounded-xl border border-slate-100 p-0 overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                      <p className="text-sm font-medium text-slate-800">{squad.name}</p>
                      <p className="text-xs text-slate-400">{squadLead ? `${squadLead.first_name} ${squadLead.last_name} — Squad Lead` : "Aucun Squad Lead"}</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {squadLead && (
                        <MemberRow
                          employeeId={squadLead.id}
                          firstName={squadLead.first_name}
                          lastName={squadLead.last_name}
                          sub="Squad Lead"
                          week={weekByMember.get(squadLead.id)}
                        />
                      )}
                      {squadMembers.map((m) => (
                        <MemberRow
                          key={m.id}
                          employeeId={m.id}
                          firstName={m.first_name}
                          lastName={m.last_name}
                          sub={m.employee_type === "internal" ? "Interne" : "Externe"}
                          week={weekByMember.get(m.id)}
                          squadOptions={duSquadOptions}
                          currentSquadId={squad.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              {tribeSquads.length === 0 && <p className="px-1 text-sm text-slate-400">Aucune Squad dans cette Tribe.</p>}
            </div>
          </div>
        );
      })}
      {tribes.length === 0 && <p className="text-sm text-slate-400">Aucune Tribe rattachée à votre DU.</p>}
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
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
      <div>
        <EditProfileButton userId={employeeId} firstName={firstName} lastName={lastName} squadOptions={squadOptions} currentSquadId={currentSquadId} />
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 text-base">
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
