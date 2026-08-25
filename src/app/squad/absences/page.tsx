import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSquadLedBy, getSquadMembers } from "@/lib/data/hierarchy";
import { CreateAbsenceForm } from "@/components/squad/CreateAbsenceForm";

export default async function SquadAbsencesPage() {
  const { profile } = await requireRole("squad_lead");
  const supabase = await createClient();
  const squad = await getSquadLedBy(supabase, profile.id);
  const members = squad ? await getSquadMembers(supabase, squad.id) : [];
  const memberIds = members.map((m) => m.id);

  const [{ data: types }, { data: absences }] = await Promise.all([
    supabase.from("absence_types").select("*").eq("active", true).order("name"),
    memberIds.length
      ? supabase
          .from("absences")
          .select("id, employee_id, start_date, end_date, comment, absence_types(name)")
          .in("employee_id", memberIds)
          .order("start_date", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Absences de la Squad</h1>
          <p className="text-sm text-slate-500">Congés, arrêts et autres absences déclarés</p>
        </div>
        <CreateAbsenceForm
          members={members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(absences ?? []).map((a) => {
          const employee = memberById.get((a as unknown as { employee_id: string }).employee_id);
          const type = (a as unknown as { absence_types: { name: string } | null }).absence_types;
          return (
            <div key={a.id} className="px-5 py-4">
              <p className="text-sm font-medium text-slate-900">
                {employee ? `${employee.first_name} ${employee.last_name}` : "—"} · {type?.name}
              </p>
              <p className="text-xs text-slate-400">
                Du {a.start_date} au {a.end_date}
              </p>
            </div>
          );
        })}
        {(absences ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune absence.</p>}
      </div>
    </div>
  );
}
