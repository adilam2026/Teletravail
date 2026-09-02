import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import type { WeekEvaluationResult } from "@/lib/rules-engine/types";
import type { DayBadge } from "@/lib/data/planning";
import type { PlanStatus } from "@/lib/supabase/database.types";
import { ComplianceBadge, StatusBadge } from "@/components/StatusBadge";

function formatDayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

export interface PlanningWeekCardProps {
  rangeLabel: string;
  status: PlanStatus;
  managerComment: string | null;
  result: WeekEvaluationResult;
  badges: Record<string, DayBadge | null>;
}

/**
 * Version consultation seule de `MonthWeekCard` : mêmes libellés/icônes par
 * jour (télétravail/bureau/absence/férié), sans aucune interaction — pas de
 * clic, pas de soumission. Composant serveur pur (pas de state, pas de
 * mutation) : la page Planning n'a besoin d'aucun JS client pour s'afficher.
 */
export function PlanningWeekCard({ rangeLabel, status, managerComment, result, badges }: PlanningWeekCardProps) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold capitalize text-slate-900">{rangeLabel}</p>
        <StatusBadge status={status} />
      </div>

      {status === "needs_changes" && managerComment && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">« {managerComment} »</p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {result.days.map((day, idx) => {
          const badge = badges[day.date];
          const cellState = day.selected
            ? { icon: "🏠", label: "Télétravail", tone: "border-brand-300 bg-brand-50" }
            : badge
              ? { icon: badge.icon, label: badge.label, tone: "border-slate-200 bg-slate-50" }
              : day.allowed
                ? { icon: "🏢", label: "Bureau", tone: "border-slate-200 bg-white" }
                : { icon: "🔒", label: "Indisponible", tone: "border-slate-200 bg-slate-100" };

          return (
            <div
              key={day.date}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center ${cellState.tone}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {WEEKDAY_LABELS[idx]} {formatDayNumber(day.date)}
              </span>
              <span className="text-lg leading-none">{cellState.icon}</span>
              <span className="text-[11px] font-medium leading-tight text-slate-700">{cellState.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
        <span>
          {result.selectedCount} / {result.quota} jour{result.quota > 1 ? "s" : ""}
        </span>
        <ComplianceBadge compliance={result.compliance} />
      </div>
    </div>
  );
}
