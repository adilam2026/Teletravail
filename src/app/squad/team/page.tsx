import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSquadLedBy, getSquadMembers } from "@/lib/data/hierarchy";
import { CreateEmployeeForm } from "@/components/squad/CreateEmployeeForm";
import { UserRowActions } from "@/components/UserRowActions";

export default async function SquadTeamPage() {
  const { profile } = await requireRole("squad_lead");
  const supabase = await createClient();
  const squad = await getSquadLedBy(supabase, profile.id);
  const members = squad ? await getSquadMembers(supabase, squad.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ma Squad</h1>
          <p className="text-sm text-slate-500">{squad ? squad.name : "Aucune Squad rattachée"}</p>
        </div>
        <CreateEmployeeForm />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {m.first_name} {m.last_name}
              </p>
              <p className="text-xs text-slate-400">
                {m.employee_type === "internal" ? "Interne" : "Externe"} · {m.login}
                {m.status === "inactive" && " · Inactif"}
              </p>
            </div>
            <UserRowActions userId={m.id} status={m.status} />
          </div>
        ))}
        {members.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun collaborateur pour le moment.</p>}
      </div>
    </div>
  );
}
