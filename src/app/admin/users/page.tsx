import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRowActions } from "@/components/UserRowActions";
import { EditProfileButton } from "@/components/admin/EditProfileButton";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

export default async function AdminUsersPage() {
  const { profile: actor } = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: users }, { data: orgUnits }, { data: tribes }, { data: squads }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("first_name"),
    supabase.from("organizational_units").select("id, name, manager_id").order("name"),
    supabase.from("tribes").select("id, name, organizational_unit_id, manager_id").order("name"),
    supabase.from("squads").select("id, name, tribe_id, manager_id").order("name"),
  ]);

  const duNameById = new Map((orgUnits ?? []).map((u) => [u.id, u.name]));
  const tribeById = new Map((tribes ?? []).map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Utilisateurs</h1>
          <p className="text-sm text-slate-500">{(users ?? []).length} compte(s)</p>
        </div>
        <CreateUserForm
          organizationalUnits={(orgUnits ?? []).map((u) => ({ id: u.id, name: u.name, managerId: u.manager_id }))}
          tribes={(tribes ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            organizationalUnitId: t.organizational_unit_id,
            managerId: t.manager_id,
            duName: duNameById.get(t.organizational_unit_id) ?? "",
          }))}
          squads={(squads ?? []).map((s) => {
            const tribe = tribeById.get(s.tribe_id);
            return {
              id: s.id,
              name: s.name,
              tribeId: s.tribe_id,
              managerId: s.manager_id,
              tribeName: tribe?.name ?? "",
              duName: tribe ? duNameById.get(tribe.organizational_unit_id) ?? "" : "",
            };
          })}
        />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(users ?? []).map((u) => {
          const squadOptions =
            u.role === "employee"
              ? (squads ?? []).map((s) => {
                  const tribe = tribeById.get(s.tribe_id);
                  const duName = tribe ? duNameById.get(tribe.organizational_unit_id) : undefined;
                  return { id: s.id, label: [duName, tribe?.name, s.name].filter(Boolean).join(" / ") };
                })
              : undefined;
          return (
            <div key={u.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <EditProfileButton
                userId={u.id}
                firstName={u.first_name}
                lastName={u.last_name}
                squadOptions={squadOptions}
                currentSquadId={u.squad_id}
                statusBadge={u.status === "inactive" ? <span className="ml-2 text-xs font-normal text-rose-500">Inactif</span> : null}
              />
              <div className="flex flex-col items-end gap-1">
                <p className="text-xs text-slate-400">
                  {ROLE_LABELS[u.role] ?? u.role}
                  {u.employee_type && ` · ${u.employee_type === "internal" ? "Interne" : "Externe"}`} · {u.login}
                </p>
                <UserRowActions userId={u.id} status={u.status} isSelf={u.id === actor.id} userLabel={`${u.first_name} ${u.last_name}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
