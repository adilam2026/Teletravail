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
  onSuccess,
}: {
  weekStart: string;
  canSubmit: boolean;
  targetEmployeeId?: string;
  label?: string;
  pendingLabel?: string;
  /** Si fourni, appelé à la place de router.refresh() — évite de recharger toute la page (ex. une carte semaine dans la vue mensuelle, section 21 du cahier des charges). */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitWeek(weekStart, targetEmployeeId);
      if (!result.ok) {
        setError(result.error ?? "Impossible de soumettre la semaine.");
        return;
      }
      if (onSuccess) onSuccess();
      else router.refresh();
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
