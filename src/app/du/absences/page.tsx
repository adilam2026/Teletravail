import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getStructureForDu, getDuLedBy, loadAbsencesForMembers } from "@/lib/data/hierarchy";
import { CreateAbsenceForm } from "@/components/squad/CreateAbsenceForm";
import { AbsenceDecisionBoard, type AbsenceBoardItem } from "@/components/manager/AbsenceDecisionBoard";

export default async function DuAbsencesPage({ searchParams }: { searchParams: Promise<{ tribe?: string; squad?: string }> }) {
  const { profile } = await requireRole("du_head");
  const params = await searchParams;
  const supabase = await createClient();

  const du = await getDuLedBy(supabase, profile.id);
  const { tribes, squads, squadLeads, members } = du
    ? await getStructureForDu(supabase, du.id)
    : { tribes: [], squads: [], squadLeads: [], members: [] };

  const selectedTribeId = (params.tribe && tribes.some((t) => t.id === params.tribe) ? params.tribe : tribes[0]?.id) ?? null;
  const tribeSquads = selectedTribeId ? squads.filter((s) => s.tribe_id === selectedTribeId) : [];
  const tribeSquadIds = new Set(tribeSquads.map((s) => s.id));

  const selectedSquadId = params.squad && params.squad !== "all" ? params.squad : null;
  const scopeMembers = !selectedTribeId
    ? []
    : selectedSquadId
      ? [...squadLeads.filter((l) => tribeSquads.find((s) => s.id === selectedSquadId)?.manager_id === l.id), ...members.filter((m) => m.squad_id === selectedSquadId)]
      : [...squadLeads.filter((l) => tribeSquads.some((s) => s.manager_id === l.id)), ...members.filter((m) => m.squad_id && tribeSquadIds.has(m.squad_id))];
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

  const tribeQuery = selectedTribeId ? `&tribe=${selectedTribeId}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Absences de la DU</h1>
          <p className="text-sm text-slate-500">{du ? du.name : "Aucune DU rattachée"}</p>
        </div>
        <CreateAbsenceForm
          members={scopeMembers.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }))}
          types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>

      {tribes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tribes.map((t) => (
            <Link
              key={t.id}
              href={`/du/absences?tribe=${t.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedTribeId === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {tribeSquads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/du/absences?${tribeQuery.slice(1)}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!selectedSquadId ? "bg-brand-100 text-brand-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
          >
            Toutes les Squads
          </Link>
          {tribeSquads.map((s) => (
            <Link
              key={s.id}
              href={`/du/absences?${tribeQuery.slice(1)}&squad=${s.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selectedSquadId === s.id ? "bg-brand-100 text-brand-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {selectedTribeId ? (
        <AbsenceDecisionBoard items={items} types={(types ?? []).map((t) => ({ id: t.id, name: t.name }))} />
      ) : (
        <p className="card text-center text-sm text-slate-400">Aucune Tribe rattachée à votre DU.</p>
      )}
    </div>
  );
}
