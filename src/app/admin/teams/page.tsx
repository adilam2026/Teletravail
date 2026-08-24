import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateTeamForm, TeamManagerSelect } from "@/components/admin/TeamForm";

export default async function AdminTeamsPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: teams }, { data: managers }, { data: members }] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("profiles").select("id, first_name, last_name").eq("role", "manager").eq("status", "active"),
    supabase.from("profiles").select("id, team_id").eq("role", "employee"),
  ]);

  const managerOptions = (managers ?? []).map((m) => ({ id: m.id, label: `${m.first_name} ${m.last_name}` }));
  const countByTeam = new Map<string, number>();
  for (const m of members ?? []) {
    if (!m.team_id) continue;
    countByTeam.set(m.team_id, (countByTeam.get(m.team_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Équipes</h1>
          <p className="text-sm text-slate-500">{(teams ?? []).length} équipe(s)</p>
        </div>
        <CreateTeamForm managers={managerOptions} />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(teams ?? []).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-400">{countByTeam.get(t.id) ?? 0} collaborateur(s)</p>
            </div>
            <div className="w-48">
              <TeamManagerSelect teamId={t.id} teamName={t.name} currentManagerId={t.manager_id} managers={managerOptions} />
            </div>
          </div>
        ))}
        {(teams ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune équipe.</p>}
      </div>
    </div>
  );
}
