import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInCasablanca } from "@/lib/date/casablanca";
import { CreateSelfAbsenceForm, EditableAbsenceRow } from "@/components/employee/SelfAbsenceForm";

export default async function EmployeeAbsencesPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const today = todayInCasablanca();

  const [{ data: absences }, { data: holidays }, { data: types }, { data: setting }] = await Promise.all([
    supabase
      .from("absences")
      .select("id, absence_type_id, start_date, end_date, comment, absence_types(name)")
      .eq("employee_id", profile.id)
      .order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("*").gte("date", today).order("date", { ascending: true }).limit(8),
    supabase.from("absence_types").select("id, name").eq("active", true).order("name"),
    supabase.from("app_settings").select("value").eq("key", "allow_employee_self_absence").maybeSingle(),
  ]);

  const selfServiceEnabled = setting?.value === true;
  const typeOptions = (types ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mes absences</h1>
          <p className="text-sm text-slate-500">Congés, arrêts et autres absences</p>
        </div>
        {selfServiceEnabled && typeOptions.length > 0 && <CreateSelfAbsenceForm employeeId={profile.id} types={typeOptions} />}
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(absences ?? []).map((a) => {
          const type = (a as unknown as { absence_types: { name: string } | null }).absence_types;
          const isFuture = a.start_date >= today;
          return (
            <div key={a.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {type?.name ?? "Absence"}
                    {!isFuture && <span className="ml-2 text-xs font-normal text-slate-400">Passée</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Du {a.start_date} au {a.end_date}
                  </p>
                  {a.comment && <p className="mt-1 text-xs text-slate-500">{a.comment}</p>}
                </div>
                {isFuture && selfServiceEnabled && (
                  <EditableAbsenceRow
                    absence={{ id: a.id, absenceTypeId: a.absence_type_id, startDate: a.start_date, endDate: a.end_date, comment: a.comment }}
                    types={typeOptions}
                  />
                )}
              </div>
            </div>
          );
        })}
        {(absences ?? []).length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune absence enregistrée.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Prochains jours fériés</h2>
        <div className="card divide-y divide-slate-100 p-0">
          {(holidays ?? []).map((h) => (
            <div key={h.id} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-slate-700">
                {h.type === "religious" ? "🕌" : "🇲🇦"} {h.name}
              </span>
              <span className="text-xs text-slate-400">
                {h.date} {h.status === "provisional" && "(prévisionnel)"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
