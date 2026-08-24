import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRowActions } from "@/components/UserRowActions";

const ROLE_LABELS: Record<string, string> = { admin: "Administrateur", manager: "Manager", employee: "Collaborateur" };

export default async function AdminUsersPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: users }, { data: teams }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("first_name"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  const managers = (users ?? []).filter((u) => u.role === "manager");
  const teamById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Utilisateurs</h1>
          <p className="text-sm text-slate-500">{(users ?? []).length} compte(s)</p>
        </div>
        <CreateUserForm
          teams={(teams ?? []).map((t) => ({ id: t.id, label: t.name }))}
          managers={managers.map((m) => ({ id: m.id, label: `${m.first_name} ${m.last_name}` }))}
        />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {u.first_name} {u.last_name}
                {u.status === "inactive" && <span className="ml-2 text-xs font-normal text-rose-500">Inactif</span>}
              </p>
              <p className="text-xs text-slate-400">
                {ROLE_LABELS[u.role]}
                {u.employee_type && ` · ${u.employee_type === "internal" ? "Interne" : "Externe"}`}
                {u.team_id && ` · ${teamById.get(u.team_id) ?? ""}`} · {u.login}
              </p>
            </div>
            <UserRowActions userId={u.id} status={u.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
