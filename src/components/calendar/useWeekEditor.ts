"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluateWeek } from "@/lib/rules-engine/engine";
import type { DayEvaluation, WeekEvaluationInput } from "@/lib/rules-engine/types";
import type { DayBadge } from "@/lib/data/planning";
import { toggleTeleworkDay } from "@/lib/actions/weeks";

export interface UseWeekEditorOptions {
  weekStart: string;
  evaluationInput: WeekEvaluationInput;
  badges: Record<string, DayBadge | null>;
  editable: boolean;
  /** Fourni quand un supérieur prépare/ajuste la semaine d'un rattaché. */
  targetEmployeeId?: string;
}

/**
 * Logique de sélection/optimistic UI/remplacement intelligent d'une semaine
 * — extraite de `WeekGrid` pour être partagée telle quelle par toute mise en
 * page qui édite une semaine (grille pleine page, carte compacte du mois...)
 * sans dupliquer le calcul des règles ni le comportement de clic.
 */
export function useWeekEditor({ weekStart, evaluationInput, badges, editable, targetEmployeeId }: UseWeekEditorOptions) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(evaluationInput.selectedDates));
  const [swapPrompt, setSwapPrompt] = useState<{ date: string; candidates: string[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set(evaluationInput.selectedDates));
  }, [evaluationInput.selectedDates]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const result = useMemo(
    () => evaluateWeek({ ...evaluationInput, selectedDates: [...selected] }),
    [evaluationInput, selected]
  );
  const dates = result.days.map((d) => d.date);

  function commit(next: Set<string>, serverCall: () => Promise<{ ok: boolean; error?: string }>) {
    const previous = selected;
    setSelected(next);
    setSwapPrompt(null);
    void serverCall().then((res) => {
      if (!res.ok) {
        setSelected(previous);
        setToast(res.error ?? "Action impossible. Réessayez.");
      }
    });
  }

  function handleClick(day: DayEvaluation) {
    if (!editable) return;
    const badge = badges[day.date];
    if (badge) return;

    if (day.selected) {
      const next = new Set(selected);
      next.delete(day.date);
      commit(next, () => toggleTeleworkDay(weekStart, day.date, undefined, targetEmployeeId));
      return;
    }

    if (day.allowed) {
      const next = new Set(selected);
      next.add(day.date);
      commit(next, () => toggleTeleworkDay(weekStart, day.date, undefined, targetEmployeeId));
      return;
    }

    if (day.swapCandidates && day.swapCandidates.length > 0) {
      if (day.swapCandidates.length === 1) {
        const replaceDate = day.swapCandidates[0]!;
        const next = new Set(selected);
        next.delete(replaceDate);
        next.add(day.date);
        commit(next, () => toggleTeleworkDay(weekStart, day.date, replaceDate, targetEmployeeId));
      } else {
        setSwapPrompt({ date: day.date, candidates: day.swapCandidates });
      }
    }
  }

  function handleSwapChoice(replaceDate: string) {
    if (!swapPrompt) return;
    const { date } = swapPrompt;
    const next = new Set(selected);
    next.delete(replaceDate);
    next.add(date);
    commit(next, () => toggleTeleworkDay(weekStart, date, replaceDate, targetEmployeeId));
  }

  return {
    selected,
    result,
    dates,
    swapPrompt,
    toast,
    handleClick,
    handleSwapChoice,
    cancelSwap: () => setSwapPrompt(null),
  };
}
