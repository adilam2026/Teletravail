import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInCasablanca } from "@/lib/date/casablanca";
import { CreateSelfAbsenceForm, EditableAbsenceRow, type SelfAbsenceRecord } from "@/components/employee/SelfAbsenceForm";
import { AbsenceHistoryButton } from "@/components/employee/AbsenceHistoryButton";
import { AbsenceStatusBadge } from "@/components/AbsenceStatusBadge";
import type { AbsenceRequestKind, ReopenRequestStatus } from "@/lib/supabase/database.types";

export default async function EmployeeAbsencesPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const today = todayInCasablanca();

  const [{ data: absences }, { data: holidays }, { data: types }, { data: setting }] = await Promise.all([
    supabase
      .from("absences")
      .select("id, absence_type_id, start_date, end_date, comment, source, created_by, status, manager_comment, absence_types(name)")
      .eq("employee_id", profile.id)
      .order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("*").gte("date", today).order("date", { ascending: true }).limit(8),
    supabase.from("absence_types").select("id, name").eq("active", true).order("name"),
    supabase.from("app_settings").select("value").eq("key", "allow_employee_self_absence").maybeSingle(),
  ]);

  const selfServiceEnabled = setting?.value === true;
  const typeOptions = (types ?? []).map((t) => ({ id: t.id, name: t.name }));

  const absenceIds = (absences ?? []).map((a) => a.id);
  const { data: requests } = absenceIds.length
    ? await supabase
        .from("absence_reopen_requests")
        .select("id, absence_id, kind, status, requested_at")
        .in("absence_id", absenceIds)
        .order("requested_at", { ascending: false })
    : { data: [] as { id: string; absence_id: string; kind: AbsenceRequestKind; status: ReopenRequestStatus; requested_at: string }[] };

  // Trié par `requested_at desc` : la première ligne rencontrée par absence
  // est bien la plus récente, quel que soit son statut (permet d'afficher
  // aussi bien "en attente" que "refusée").
  const latestRequestByAbsence = new Map<string, { id: string; kind: AbsenceRequestKind; status: ReopenRequestStatus }>();
  for (const r of requests ?? []) {
    if (!latestRequestByAbsence.has(r.absence_id)) {
      latestRequestByAbsence.set(r.absence_id, { id: r.id, kind: r.kind, status: r.status });
    }
  }

  const creatorIds = [...new Set((absences ?? []).map((a) => a.created_by).filter((id): id is string => !!id && id !== profile.id))];
  const { data: creators } = creatorIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", creatorIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const creatorNameById = new Map((creators ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

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
          const addedByOther = a.created_by && a.created_by !== profile.id;
          const record: SelfAbsenceRecord = {
            id: a.id,
            absenceTypeId: a.absence_type_id,
            typeName: type?.name ?? null,
            startDate: a.start_date,
            endDate: a.end_date,
            comment: a.comment,
            status: a.status,
            managerComment: a.manager_comment,
            latestRequest: latestRequestByAbsence.get(a.id) ?? null,
          };
          return (
            <div key={a.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {type?.name ?? "Absence"}
                      {!isFuture && <span className="ml-2 text-xs font-normal text-slate-400">Passée</span>}
                    </p>
                    <AbsenceStatusBadge status={a.status} />
                    <AbsenceHistoryButton absenceId={a.id} compact />
                  </div>
                  <p className="text-xs text-slate-400">
                    Du {a.start_date} au {a.end_date}
                    {addedByOther && ` · Ajoutée par ${creatorNameById.get(a.created_by!) ?? "votre hiérarchie"}`}
                  </p>
                  {a.comment && <p className="mt-1 text-xs text-slate-500">{a.comment}</p>}
                  {a.status === "needs_changes" && a.manager_comment && (
                    <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">« {a.manager_comment} »</p>
                  )}
                  {a.status === "cancelled" && a.manager_comment && <p className="mt-1 text-xs text-slate-500">{a.manager_comment}</p>}
                </div>
                {isFuture && selfServiceEnabled && <EditableAbsenceRow absence={record} types={typeOptions} />}
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
