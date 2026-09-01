"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitWeek } from "@/lib/actions/weeks";

export function SubmitWeekButton({
  weekStart,
  canSubmit,
  targetEmployeeId,
  label = "Soumettre ma semaine",
  pendingLabel = "Envoi...",
  onOptimistic,
  onError,
  onSuccess,
}: {
  weekStart: string;
  canSubmit: boolean;
  targetEmployeeId?: string;
  label?: string;
  pendingLabel?: string;
  /**
   * Appelé de façon synchrone au clic, avant même la réponse serveur — UI
   * vraiment optimiste (section 11-12 du cahier des charges perf) : le
   * statut change à l'écran dans la même fraction de seconde, pas après un
   * aller-retour réseau. Ce composant disparaît généralement de l'arbre
   * juste après (le parent bascule sur un autre statut), donc son propre
   * indicateur "pending" local n'a plus le temps de s'afficher — normal.
   */
  onOptimistic?: () => void;
  /** Appelé si la mutation échoue, pour annuler ce que `onOptimistic` avait affiché. */
  onError?: (message: string) => void;
  /** Si fourni (et sans `onOptimistic`), appelé à la place de router.refresh(). */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    onOptimistic?.();
    startTransition(async () => {
      const result = await submitWeek(weekStart, targetEmployeeId);
      if (!result.ok) {
        const message = result.error ?? "Impossible de soumettre la semaine.";
        if (onError) onError(message);
        else setError(message);
        return;
      }
      if (onSuccess) onSuccess();
      else if (!onOptimistic) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="button" className="btn-primary" disabled={!canSubmit || pending} onClick={handleSubmit}>
        {pending ? pendingLabel : label}
      </button>
      {!canSubmit && <p className="text-xs text-slate-400">Corrigez les anomalies avant de soumettre.</p>}
    </div>
  );
}
