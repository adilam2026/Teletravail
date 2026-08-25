import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSquadLedBy, getSquadMembers, loadGroupWeek } from "@/lib/data/hierarchy";
import { addWeeks, currentWeekStart, mondayOf } from "@/lib/date/casablanca";
import { weekDates, WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus } from "@/lib/supabase/database.types";

export default async function SquadPlanningPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { profile } = await requireRole("squad_lead");
  const params = await searchParams;
  const weekStart = params.week ? mondayOf(params.week) : currentWeekStart();
  const supabase = await createClient();

  const squad = await getSquadLedBy(supabase, profile.id);
  const members = squad ? await getSquadMembers(supabase, squad.id) : [];
  const overview = await loadGroupWeek(supabase, members, weekStart);
  const dates = weekDates(weekStart);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning équipe</h1>
          <p className="text-sm text-slate-500">Semaine du {weekStart}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/squad/planning?week=${addWeeks(weekStart, -1)}`} className="btn-secondary">
            ← Semaine précédente
          </Link>
          <Link href={`/squad/planning?week=${addWeeks(weekStart, 1)}`} className="btn-secondary">
            Semaine suivante →
          </Link>
        </div>
      </div>

      <div className="card">
        <p className="mb-3 text-sm font-semibold text-slate-800">Présence prévisionnelle au bureau</p>
        <div className="grid grid-cols-5 gap-3 text-center">
          {overview.presence.map((p, idx) => (
            <div key={p.date}>
              <p className="text-xs font-medium text-slate-400">{WEEKDAY_LABELS[idx]}</p>
              <p className={`text-lg font-semibold ${p.belowThreshold ? "text-amber-600" : "text-slate-800"}`}>
                {p.officePercent}% {p.belowThreshold && "⚠️"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-400">
              <th className="px-5 py-3">Collaborateur</th>
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} className="px-3 py-3 text-center">
                  {label}
                </th>
              ))}
              <th className="px-5 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {overview.members.map((m) => (
              <tr key={m.profile.id} className="border-b border-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">
                  {m.profile.first_name} {m.profile.last_name}
                </td>
                {m.days.map((d) => (
                  <td key={d.date} className="px-3 py-3 text-center text-lg" title={d.label}>
                    {d.icon}
                  </td>
                ))}
                <td className="px-5 py-3">
                  {m.status === "not_submitted" ? (
                    <span className="badge bg-slate-100 text-slate-500">⚪ Non soumise</span>
                  ) : (
                    <StatusBadge status={m.status as PlanStatus} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!overview.members.length && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun collaborateur.</p>}
      </div>
      <p className="text-xs text-slate-400">{dates.length > 0 && `Semaine du ${dates[0]} au ${dates[4]}`}</p>
    </div>
  );
}
