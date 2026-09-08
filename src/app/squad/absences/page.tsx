import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSquadLedBy, getSquadMembers, loadAbsencesForMembers } from "@/lib/data/hierarchy";
import { CreateAbsenceForm } from "@/components/squad/CreateAbsenceForm";
import { AbsenceDecisionBoard, type AbsenceBoardItem } from "@/components/manager/AbsenceDecisionBoard";

export default async function SquadAbsencesPage() {
  const { profile } = await requireRole("squad_lead");
  const supabase = await createClient();
  const squad = await getSquadLedBy(supabase, profile.id);
  const members = squad ? await getSquadMembers(supabase, squad.id) : [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  const [{ data: types }, absences] = await Promise.all([
    supabase.from("absence_types").select("*").eq("active", true).order("name"),
    loadAbsencesForMembers(supabase, members),
  ]);

  const items: AbsenceBoardItem[] = absences.map((a) => {
    const employee = memberById.get(a.employeeId);
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
          <h1 className="text-2xl font-semibold text-slate-900">Absences de la Squad</h1>
          <p className="text-sm text-slate-500">Congés, arrêts et autres absences déclarés</p>
        </div>
        <CreateAbsenceForm
          members={members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      <AbsenceDecisionBoard items={items} types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
