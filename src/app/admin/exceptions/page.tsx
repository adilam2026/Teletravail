import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateExceptionForm, DeleteExceptionButton } from "@/components/admin/ExceptionForm";

const TYPE_LABELS: Record<string, string> = {
  mandatory_office: "Présence obligatoire",
  telework_forbidden: "Télétravail interdit",
  telework_allowed: "Télétravail exceptionnellement autorisé",
  site_closure: "Fermeture de site",
  company_event: "Événement d'entreprise",
  seminar: "Séminaire",
  custom_period: "Période particulière",
};

export default async function AdminExceptionsPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: exceptions }, { data: teams }, { data: employees }] = await Promise.all([
    supabase.from("company_exceptions").select("*").order("start_date", { ascending: false }),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("profiles").select("id, first_name, last_name").eq("status", "active").order("first_name"),
  ]);

  const teamById = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const employeeById = new Map((employees ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Exceptions</h1>
          <p className="text-sm text-slate-500">Journées de présence obligatoire, fermetures, événements...</p>
        </div>
        <CreateExceptionForm
          teams={(teams ?? []).map((t) => ({ id: t.id, label: t.name }))}
          employees={(employees ?? []).map((e) => ({ id: e.id, label: `${e.first_name} ${e.last_name}` }))}
        />
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(exceptions ?? []).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">
                🔒 {e.name} · {TYPE_LABELS[e.type] ?? e.type}
              </p>
              <p className="text-xs text-slate-400">
                Du {e.start_date} au {e.end_date} ·{" "}
                {e.scope === "company" ? "Toute l'entreprise" : e.scope === "team" ? teamById.get(e.team_id ?? "") ?? "Équipe" : employeeById.get(e.employee_id ?? "") ?? "Collaborateur"}
              </p>
            </div>
            <DeleteExceptionButton id={e.id} />
          </div>
        ))}
        {(exceptions ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune exception.</p>}
      </div>
    </div>
  );
}
