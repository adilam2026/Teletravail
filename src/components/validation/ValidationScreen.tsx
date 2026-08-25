import type { AppSupabaseClient } from "@/lib/supabase/server";
import { loadEmployeeWeek } from "@/lib/data/planning";
import type { PlanStatus, ProfileRow } from "@/lib/supabase/database.types";
import { ValidationBoard, type ValidationRowData } from "@/components/squad/ValidationBoard";

/**
 * Écran "À valider" générique : réutilisé tel quel par Squad Lead, Tribe Lead
 * et Responsable DU (section 19) — seule la liste des rattachés directs
 * change selon le niveau appelant.
 */
export async function ValidationScreen({
  supabase,
  members,
  title,
  subtitle,
}: {
  supabase: AppSupabaseClient;
  members: ProfileRow[];
  title: string;
  subtitle: string;
}) {
  const { data: submittedPlans } = members.length
    ? await supabase
        .from("weekly_plans")
        .select("id, employee_id, week_start")
        .eq("status", "submitted")
        .in(
          "employee_id",
          members.map((m) => m.id)
        )
        .order("submitted_at", { ascending: true })
    : { data: [] as { id: string; employee_id: string; week_start: string }[] };

  const memberById = new Map(members.map((m) => [m.id, m]));

  const rows: ValidationRowData[] = [];
  for (const plan of submittedPlans ?? []) {
    const employee = memberById.get(plan.employee_id);
    if (!employee) continue;
    const week = await loadEmployeeWeek(supabase, employee, plan.week_start);
    rows.push({
      planId: plan.id,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      weekStart: plan.week_start,
      selectedCount: week.result.selectedCount,
      quota: week.result.quota,
      compliance: week.result.compliance,
      alertMessages: week.result.alerts.map((a) => a.message),
    });
  }

  const validatedCount = await countByStatus(
    supabase,
    members.map((m) => m.id),
    "validated"
  );
  const notSubmittedCount = members.length - rows.length - validatedCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IndicatorCard label="Rattachés" value={members.length} />
        <IndicatorCard label="À valider" value={rows.length} />
        <IndicatorCard label="Validées" value={validatedCount} />
        <IndicatorCard label="Non soumises" value={Math.max(notSubmittedCount, 0)} />
      </div>

      <ValidationBoard rows={rows} />
    </div>
  );
}

function IndicatorCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

async function countByStatus(supabase: AppSupabaseClient, employeeIds: string[], status: PlanStatus): Promise<number> {
  if (employeeIds.length === 0) return 0;
  const { count } = await supabase
    .from("weekly_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", status)
    .in("employee_id", employeeIds);
  return count ?? 0;
}
