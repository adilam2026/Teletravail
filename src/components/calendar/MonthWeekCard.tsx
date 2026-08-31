"use client";

import { useState } from "react";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import type { WeekEvaluationInput } from "@/lib/rules-engine/types";
import type { DayBadge } from "@/lib/data/planning";
import type { PlanStatus } from "@/lib/supabase/database.types";
import { ComplianceBadge, StatusBadge } from "@/components/StatusBadge";
import { SubmitWeekButton } from "@/components/employee/SubmitWeekButton";
import { RecallWeekButton } from "@/components/employee/RecallWeekButton";
import { ReopenWeekButton } from "@/components/employee/ReopenWeekButton";
import { WeekHistoryButton } from "@/components/calendar/WeekHistoryButton";
import { useWeekEditor } from "@/components/calendar/useWeekEditor";

const EDITABLE_STATUSES: PlanStatus[] = ["draft", "needs_changes"];

function formatDayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

function dayLabel(dates: string[], date: string): string {
  const idx = dates.indexOf(date);
  return idx >= 0 ? WEEKDAY_LABELS[idx]! : date;
}

export interface MonthWeekCardProps {
  weekStart: string;
  rangeLabel: string;
  planId: string;
  initialStatus: PlanStatus;
  managerComment: string | null;
  evaluationInput: WeekEvaluationInput;
  badges: Record<string, DayBadge | null>;
}

/**
 * Carte compacte d'une semaine dans la vue mensuelle (section 3-16 du cahier
 * des charges "vue mensuelle") : même moteur de sélection/optimistic UI que
 * `WeekGrid` (via `useWeekEditor`), mais une mise en page resserrée et un
 * état (statut) totalement local, pour que soumettre/rappeler cette semaine
 * ne recharge jamais les autres cartes du mois (section 21).
 */
export function MonthWeekCard({ weekStart, rangeLabel, planId, initialStatus, managerComment, evaluationInput, badges }: MonthWeekCardProps) {
  const [status, setStatus] = useState<PlanStatus>(initialStatus);
  const editable = EDITABLE_STATUSES.includes(status);

  const { result, dates, swapPrompt, toast, handleClick, handleSwapChoice, cancelSwap } = useWeekEditor({
    weekStart,
    evaluationInput,
    badges,
    editable,
  });

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold capitalize text-slate-900">{rangeLabel}</p>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <WeekHistoryButton planId={planId} compact />
        </div>
      </div>

      {status === "needs_changes" && managerComment && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">« {managerComment} »</p>
      )}

      {toast && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{toast}</p>}

      {swapPrompt && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <span>Remplacer quel jour ?</span>
          {swapPrompt.candidates.map((c) => (
            <button key={c} type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => handleSwapChoice(c)}>
              {dayLabel(dates, c)}
            </button>
          ))}
          <button type="button" className="px-2 py-1 text-xs text-slate-500 underline" onClick={cancelSwap}>
            Annuler
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
              title={!day.selected && !day.allowed && day.reason && !badge ? day.reason : undefined}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center transition ${cellState.tone} ${
                clickable ? "cursor-pointer hover:border-brand-400 hover:shadow-card" : "cursor-default"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {WEEKDAY_LABELS[idx]} {formatDayNumber(day.date)}
              </span>
              <span className="text-lg leading-none">{cellState.icon}</span>
              <span className="text-[11px] font-medium leading-tight text-slate-700">{cellState.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>
            {result.selectedCount} / {result.quota} jour{result.quota > 1 ? "s" : ""}
          </span>
          <ComplianceBadge compliance={result.compliance} />
        </div>

        {status === "draft" && (
          <SubmitWeekButton
            weekStart={weekStart}
            canSubmit={result.canSubmit}
            label="Soumettre ma demande"
            pendingLabel="Envoi..."
            onSuccess={() => setStatus("submitted")}
          />
        )}

        {status === "needs_changes" && (
          <SubmitWeekButton
            weekStart={weekStart}
            canSubmit={result.canSubmit}
            label="Modifier puis resoumettre"
            pendingLabel="Envoi..."
            onSuccess={() => setStatus("submitted")}
          />
        )}

        {/* Le statut ("En attente de validation" / "Validée ✓"...) est déjà porté par le
            badge d'en-tête (section 5) : pas de répétition ici, seulement l'action disponible. */}
        {status === "submitted" && <RecallWeekButton planId={planId} onSuccess={() => setStatus("draft")} />}

        {status === "validated" && <ReopenWeekButton planId={planId} />}
      </div>
    </div>
  );
}
