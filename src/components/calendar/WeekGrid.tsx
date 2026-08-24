"use client";

import { useState, useTransition } from "react";
import type { DayEvaluation } from "@/lib/rules-engine";
import type { DayBadge } from "@/lib/data/planning";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";

export interface WeekGridProps {
  days: DayEvaluation[];
  badges: Record<string, DayBadge | null>;
  editable: boolean;
  onToggle?: (date: string) => Promise<{ ok: boolean; error?: string }>;
}

function formatDayNumber(date: string): string {
  return date.slice(8, 10);
}

export function WeekGrid({ days, badges, editable, onToggle }: WeekGridProps) {
  const [pending, startTransition] = useTransition();
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick(day: DayEvaluation) {
    if (!editable || !onToggle) return;
    if (!day.selected && !day.allowed) return;
    setError(null);
    setPendingDate(day.date);
    startTransition(async () => {
      const result = await onToggle(day.date);
      if (!result.ok) setError(result.error ?? "Action impossible.");
      setPendingDate(null);
    });
  }

  return (
    <div>
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {days.map((day, idx) => {
          const badge = badges[day.date];
          const isPending = pending && pendingDate === day.date;
          const clickable = editable && (day.selected || day.allowed) && !badge;
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
              disabled={!clickable || isPending}
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
              <span className="text-2xl">{isPending ? "…" : cellState.icon}</span>
              <span className="text-sm font-medium text-slate-700">{cellState.label}</span>
              {!day.selected && !day.allowed && day.reason && !badge && (
                <span className="text-xs text-rose-600">{day.reason}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
