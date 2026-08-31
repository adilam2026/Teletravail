"use client";

import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import type { WeekEvaluationInput } from "@/lib/rules-engine/types";
import type { DayBadge } from "@/lib/data/planning";
import { ComplianceBadge, StatusBadge } from "@/components/StatusBadge";
import { SubmitWeekButton } from "@/components/employee/SubmitWeekButton";
import { RecallWeekButton } from "@/components/employee/RecallWeekButton";
import { useWeekEditor } from "@/components/calendar/useWeekEditor";
import type { PlanStatus } from "@/lib/supabase/database.types";

export interface WeekGridProps {
  weekStart: string;
  planId: string;
  evaluationInput: WeekEvaluationInput;
  badges: Record<string, DayBadge | null>;
  editable: boolean;
  planStatus: PlanStatus;
  /** Fourni quand un supérieur prépare/ajuste la semaine d'un rattaché (section 14-19) — sinon, l'agenda de l'acteur lui-même. */
  targetEmployeeId?: string;
}

function formatDayNumber(date: string): string {
  return date.slice(8, 10);
}

function dayLabel(dates: string[], date: string): string {
  const idx = dates.indexOf(date);
  return idx >= 0 ? WEEKDAY_LABELS[idx]! : date;
}

/**
 * Panneau semaine réellement optimiste (section "instantanéité" du cahier
 * des charges) : chaque clic met à jour l'état local et recalcule
 * `evaluateWeek` de façon synchrone — compteur de quota, alertes, grille et
 * bouton de soumission changent sans attendre le serveur. L'action serveur
 * part ensuite en arrière-plan ; en cas d'échec, l'état est restauré et un
 * toast bref explique pourquoi (jamais de spinner bloquant, jamais de
 * rechargement de page).
 */
export function WeekGrid({ weekStart, planId, evaluationInput, badges, editable, planStatus, targetEmployeeId }: WeekGridProps) {
  const { result, dates, swapPrompt, toast, handleClick, handleSwapChoice, cancelSwap } = useWeekEditor({
    weekStart,
    evaluationInput,
    badges,
    editable,
    targetEmployeeId,
  });

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={planStatus} />
          <ComplianceBadge compliance={result.compliance} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">
            Télétravail : {result.selectedCount} / {result.quota} jour{result.quota > 1 ? "s" : ""}
          </span>
          {planStatus === "submitted" && !targetEmployeeId && <RecallWeekButton planId={planId} />}
        </div>
      </div>

      {result.alerts.length > 0 && (
        <div className="space-y-2">
          {result.alerts.map((alert, idx) => (
            <p
              key={idx}
              className={`rounded-lg px-3 py-2 text-sm ${
                alert.severity === "blocking"
                  ? "bg-rose-50 text-rose-700"
                  : alert.severity === "warning"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {alert.message}
            </p>
          ))}
        </div>
      )}

      {toast && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{toast}</p>}

      {swapPrompt && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <span>Remplacer quel jour ?</span>
          {swapPrompt.candidates.map((c) => (
            <button
              key={c}
              type="button"
              className="btn-secondary px-3 py-1 text-xs"
              onClick={() => handleSwapChoice(c)}
            >
              {dayLabel(dates, c)}
            </button>
          ))}
          <button type="button" className="px-3 py-1 text-xs text-slate-500 underline" onClick={cancelSwap}>
            Annuler
          </button>
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {result.days.map((day, idx) => {
            const badge = badges[day.date];
            const clickable = editable && (day.selected || day.allowed || (day.swapCandidates?.length ?? 0) > 0) && !badge;
            const cellState = day.selected
              ? { icon: "🏠", label: "Télétravail", tone: "border-brand-300 bg-brand-50" }
              : badge
                ? { icon: badge.icon, label: badge.label, tone: "border-slate-200 bg-slate-50" }
                : day.allowed
                  ? { icon: "🏢", label: "Bureau", tone: "border-slate-200 bg-white" }
                  : { icon: "🔒", label: "Indisponible", tone: "border-slate-200 bg-slate-100" };

            return (
              <button
                key={day.date}
                type="button"
                disabled={!clickable}
                onClick={() => handleClick(day)}
                className={`flex min-h-[112px] flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${cellState.tone} ${
                  clickable ? "cursor-pointer hover:border-brand-400 hover:shadow-card" : "cursor-default"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {WEEKDAY_LABELS[idx]}
                  </span>
                  <span className="text-xs text-slate-400">{formatDayNumber(day.date)}</span>
                </div>
                <span className="text-2xl">{cellState.icon}</span>
                <span className="text-sm font-medium text-slate-700">{cellState.label}</span>
                {!day.selected && !day.allowed && day.reason && !badge && (
                  <span className="text-xs text-rose-600">{day.reason}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {editable && (
        <div className="flex justify-end">
          <SubmitWeekButton weekStart={weekStart} canSubmit={result.canSubmit} targetEmployeeId={targetEmployeeId} />
        </div>
      )}
    </div>
  );
}
