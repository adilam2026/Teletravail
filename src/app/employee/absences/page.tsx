import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInCasablanca } from "@/lib/date/casablanca";

export default async function EmployeeAbsencesPage() {
  const { profile } = await requireRole("employee");
  const supabase = await createClient();
  const today = todayInCasablanca();

  const [{ data: absences }, { data: holidays }] = await Promise.all([
    supabase
      .from("absences")
      .select("id, start_date, end_date, comment, absence_types(name)")
      .eq("employee_id", profile.id)
      .order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("*").gte("date", today).order("date", { ascending: true }).limit(8),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mes absences</h1>
        <p className="text-sm text-slate-500">Congés, arrêts et autres absences enregistrés par votre manager</p>
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(absences ?? []).map((a) => {
          const type = (a as unknown as { absence_types: { name: string } | null }).absence_types;
          return (
            <div key={a.id} className="px-5 py-4">
              <p className="text-sm font-medium text-slate-900">{type?.name ?? "Absence"}</p>
              <p className="text-xs text-slate-400">
                Du {a.start_date} au {a.end_date}
              </p>
              {a.comment && <p className="mt-1 text-xs text-slate-500">{a.comment}</p>}
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
