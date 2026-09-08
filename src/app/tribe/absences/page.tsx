import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMembersForTribe, getTribeLedBy, loadAbsencesForMembers } from "@/lib/data/hierarchy";
import { CreateAbsenceForm } from "@/components/squad/CreateAbsenceForm";
import { AbsenceDecisionBoard, type AbsenceBoardItem } from "@/components/manager/AbsenceDecisionBoard";

export default async function TribeAbsencesPage({ searchParams }: { searchParams: Promise<{ squad?: string }> }) {
  const { profile } = await requireRole("tribe_lead");
  const params = await searchParams;
  const supabase = await createClient();

  const tribe = await getTribeLedBy(supabase, profile.id);
  const { squads, squadLeads, members } = tribe ? await getMembersForTribe(supabase, tribe.id) : { squads: [], squadLeads: [], members: [] };

  const selectedSquadId = params.squad && params.squad !== "all" ? params.squad : null;
  const scopeMembers = selectedSquadId
    ? [...squadLeads.filter((l) => squads.find((s) => s.id === selectedSquadId)?.manager_id === l.id), ...members.filter((m) => m.squad_id === selectedSquadId)]
    : [...squadLeads, ...members];
  const memberById = new Map(scopeMembers.map((m) => [m.id, m]));

  const [{ data: types }, absences] = await Promise.all([
    supabase.from("absence_types").select("*").eq("active", true).order("name"),
    loadAbsencesForMembers(supabase, scopeMembers),
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
          <h1 className="text-2xl font-semibold text-slate-900">Absences de la Tribe</h1>
          <p className="text-sm text-slate-500">{tribe ? tribe.name : "Aucune Tribe rattachée"}</p>
        </div>
        <CreateAbsenceForm
          members={scopeMembers.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      {squads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tribe/absences"
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!selectedSquadId ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Toutes les Squads
          </Link>
          {squads.map((s) => (
            <Link
              key={s.id}
              href={`/tribe/absences?squad=${s.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedSquadId === s.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      <AbsenceDecisionBoard items={items} types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
