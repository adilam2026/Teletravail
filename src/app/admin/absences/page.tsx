import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateAbsenceForm } from "@/components/manager/CreateAbsenceForm";
import { DeleteAbsenceButton } from "@/components/admin/DeleteAbsenceButton";

export default async function AdminAbsencesPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: employees }, { data: types }, { data: absences }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").eq("status", "active").order("first_name"),
    supabase.from("absence_types").select("*").order("name"),
    supabase
      .from("absences")
      .select("id, employee_id, start_date, end_date, comment, absence_types(name)")
      .order("start_date", { ascending: false })
      .limit(200),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Absences</h1>
          <p className="text-sm text-slate-500">Toutes les absences enregistrées</p>
        </div>
        <CreateAbsenceForm
          members={(employees ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(absences ?? []).map((a) => {
          const employee = employeeById.get((a as unknown as { employee_id: string }).employee_id);
          const type = (a as unknown as { absence_types: { name: string } | null }).absence_types;
          return (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {employee ? `${employee.first_name} ${employee.last_name}` : "—"} · {type?.name}
                </p>
                <p className="text-xs text-slate-400">
                  Du {a.start_date} au {a.end_date}
                </p>
              </div>
              <DeleteAbsenceButton id={a.id} />
            </div>
          );
        })}
        {(absences ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune absence.</p>}
      </div>
    </div>
  );
}
