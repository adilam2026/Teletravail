import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  CreateOrgUnitForm,
  CreateSquadForm,
  CreateTribeForm,
  OrgUnitManagerSelect,
  SquadManagerSelect,
  TribeManagerSelect,
} from "@/components/admin/OrgForm";
import type { Option } from "@/components/admin/CreateUserForm";

export default async function AdminOrganisationPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: orgUnits }, { data: tribes }, { data: squads }, { data: profiles }, { data: members }] = await Promise.all([
    supabase.from("organizational_units").select("*").order("name"),
    supabase.from("tribes").select("*").order("name"),
    supabase.from("squads").select("*").order("name"),
    supabase.from("profiles").select("id, first_name, last_name, role").eq("status", "active"),
    supabase.from("profiles").select("id, squad_id").eq("role", "employee"),
  ]);

  const toOption = (p: { id: string; first_name: string; last_name: string }): Option => ({ id: p.id, label: `${p.first_name} ${p.last_name}` });
  const duHeadOptions = (profiles ?? []).filter((p) => p.role === "du_head").map(toOption);
  const tribeLeadOptions = (profiles ?? []).filter((p) => p.role === "tribe_lead").map(toOption);
  const squadLeadOptions = (profiles ?? []).filter((p) => p.role === "squad_lead").map(toOption);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  const memberCountBySquad = new Map<string, number>();
  for (const m of members ?? []) {
    if (!m.squad_id) continue;
    memberCountBySquad.set(m.squad_id, (memberCountBySquad.get(m.squad_id) ?? 0) + 1);
  }

  const tribesByDu = new Map<string, typeof tribes>();
  for (const t of tribes ?? []) {
    const list = tribesByDu.get(t.organizational_unit_id) ?? [];
    list.push(t);
    tribesByDu.set(t.organizational_unit_id, list);
  }
  const squadsByTribe = new Map<string, typeof squads>();
  for (const s of squads ?? []) {
    const list = squadsByTribe.get(s.tribe_id) ?? [];
    list.push(s);
    squadsByTribe.set(s.tribe_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Organisation</h1>
          <p className="text-sm text-slate-500">
            {(orgUnits ?? []).length} DU · {(tribes ?? []).length} Tribe(s) · {(squads ?? []).length} Squad(s)
          </p>
        </div>
        <CreateOrgUnitForm duHeads={duHeadOptions} />
      </div>

      <div className="space-y-4">
        {(orgUnits ?? []).map((du) => (
          <div key={du.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">🏢 {du.name}</p>
                <p className="text-xs text-slate-400">
                  Responsable DU : {du.manager_id ? nameById.get(du.manager_id) ?? "—" : "Aucun"}
                </p>
              </div>
              <div className="w-56">
                <OrgUnitManagerSelect id={du.id} name={du.name} currentManagerId={du.manager_id} options={duHeadOptions} />
              </div>
            </div>

            <div className="space-y-3 border-l-2 border-slate-100 pl-4">
              {(tribesByDu.get(du.id) ?? []).map((tribe) => (
                <div key={tribe.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">🌿 {tribe.name}</p>
                      <p className="text-xs text-slate-400">Tribe Lead : {tribe.manager_id ? nameById.get(tribe.manager_id) ?? "—" : "Aucun"}</p>
                    </div>
                    <div className="w-56">
                      <TribeManagerSelect id={tribe.id} name={tribe.name} currentManagerId={tribe.manager_id} options={tribeLeadOptions} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 border-l-2 border-white pl-4">
                    {(squadsByTribe.get(tribe.id) ?? []).map((squad) => (
                      <div key={squad.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                        <div>
                          <p className="text-sm text-slate-700">🧩 {squad.name}</p>
                          <p className="text-xs text-slate-400">
                            {memberCountBySquad.get(squad.id) ?? 0} collaborateur(s) · Squad Lead :{" "}
                            {squad.manager_id ? nameById.get(squad.manager_id) ?? "—" : "Aucun"}
                          </p>
                        </div>
                        <div className="w-56">
                          <SquadManagerSelect id={squad.id} name={squad.name} currentManagerId={squad.manager_id} options={squadLeadOptions} />
                        </div>
                      </div>
                    ))}
                    <CreateSquadForm tribeId={tribe.id} squadLeads={squadLeadOptions} />
                  </div>
                </div>
              ))}
              <CreateTribeForm organizationalUnitId={du.id} tribeLeads={tribeLeadOptions} />
            </div>
          </div>
        ))}
        {(orgUnits ?? []).length === 0 && <p className="card text-center text-sm text-slate-400">Aucune DU. Créez-en une pour commencer.</p>}
      </div>
    </div>
  );
}
