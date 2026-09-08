import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadAbsencesForMembers } from "@/lib/data/hierarchy";
import { CreateAbsenceForm } from "@/components/squad/CreateAbsenceForm";
import { AbsenceDecisionBoard, type AbsenceBoardItem } from "@/components/manager/AbsenceDecisionBoard";
import type { ProfileRow } from "@/lib/supabase/database.types";

export default async function AdminAbsencesPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: employees }, { data: types }] = await Promise.all([
    supabase.from("profiles").select("*").eq("status", "active").order("first_name"),
    supabase.from("absence_types").select("*").order("name"),
  ]);

  const allEmployees = (employees ?? []) as ProfileRow[];
  const employeeById = new Map(allEmployees.map((e) => [e.id, e]));
  const absences = await loadAbsencesForMembers(supabase, allEmployees);

  const items: AbsenceBoardItem[] = absences.map((a) => {
    const employee = employeeById.get(a.employeeId);
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "—",
      absenceTypeId: a.absenceTypeId,
      typeName: a.typeName,
      startDate: a.startDate,
      endDate: a.endDate,
      comment: a.comment,
      status: a.status,
      managerComment: a.managerComment,
      pendingRequest: a.pendingRequest,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Absences</h1>
          <p className="text-sm text-slate-500">Toutes les absences enregistrées</p>
        </div>
        <CreateAbsenceForm
          members={allEmployees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      <AbsenceDecisionBoard items={items} types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
