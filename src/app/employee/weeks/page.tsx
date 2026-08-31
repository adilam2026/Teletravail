import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addWeeks, currentWeekStart } from "@/lib/date/casablanca";
import { StatusBadge } from "@/components/StatusBadge";

export default async function WeeksPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const current = currentWeekStart();
  const earliest = addWeeks(current, -8);
  const latest = addWeeks(current, 4);

  const { data: plans } = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("employee_id", profile.id)
    .gte("week_start", earliest)
    .lte("week_start", latest)
    .order("week_start", { ascending: false });

  const planIds = (plans ?? []).map((p) => p.id);
  const { data: days } = planIds.length
    ? await supabase.from("telework_days").select("weekly_plan_id").in("weekly_plan_id", planIds)
    : { data: [] as { weekly_plan_id: string }[] };

  const countByPlan = new Map<string, number>();
  for (const d of days ?? []) countByPlan.set(d.weekly_plan_id, (countByPlan.get(d.weekly_plan_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mes semaines</h1>
        <p className="text-sm text-slate-500">Historique et suivi de vos demandes de télétravail</p>
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(plans ?? []).map((plan) => (
          <Link
            key={plan.id}
            href={`/employee/agenda?month=${plan.week_start.slice(0, 7)}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">Semaine du {plan.week_start}</p>
              <p className="text-xs text-slate-400">{countByPlan.get(plan.id) ?? 0} jour(s) de télétravail</p>
            </div>
            <StatusBadge status={plan.status} />
          </Link>
        ))}
        {(plans ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune semaine trouvée.</p>}
      </div>
    </div>
  );
}
