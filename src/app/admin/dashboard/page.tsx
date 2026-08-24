import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, todayInCasablanca } from "@/lib/date/casablanca";

export default async function AdminDashboardPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const weekStart = currentWeekStart();
  const today = todayInCasablanca();

  const [
    { count: totalUsers },
    { count: internalCount },
    { count: externalCount },
    { count: managerCount },
    { count: teamCount },
    { count: pendingCount },
    { count: activeEmployeeCount },
    { count: submittedThisWeek },
    { data: upcomingHolidays },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("employee_type", "internal").eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("employee_type", "external").eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "manager").eq("status", "active"),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("weekly_plans").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "employee").eq("status", "active"),
    supabase
      .from("weekly_plans")
      .select("id", { count: "exact", head: true })
      .eq("week_start", weekStart)
      .neq("status", "draft"),
    supabase.from("public_holidays").select("*").gte("date", today).order("date", { ascending: true }).limit(5),
  ]);

  const notSubmitted = Math.max((activeEmployeeCount ?? 0) - (submittedThisWeek ?? 0), 0);

  const cards = [
    { label: "Utilisateurs actifs", value: totalUsers ?? 0 },
    { label: "Internes", value: internalCount ?? 0 },
    { label: "Externes", value: externalCount ?? 0 },
    { label: "Managers", value: managerCount ?? 0 },
    { label: "Équipes", value: teamCount ?? 0 },
    { label: "Demandes à valider", value: pendingCount ?? 0 },
    { label: "Semaines non soumises (cette semaine)", value: notSubmitted },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Vue d&apos;ensemble de l&apos;organisation</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-xs font-medium text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Prochains jours fériés</h2>
        <div className="card divide-y divide-slate-100 p-0">
          {(upcomingHolidays ?? []).map((h) => (
            <div key={h.id} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-slate-700">
                {h.type === "religious" ? "🕌" : "🇲🇦"} {h.name}
              </span>
              <span className="text-xs text-slate-400">
                {h.date} {h.status === "provisional" && "(prévisionnel)"}
              </span>
            </div>
          ))}
          {(upcomingHolidays ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun jour férié à venir.</p>
          )}
        </div>
      </div>
    </div>
  );
}
