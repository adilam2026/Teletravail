"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectWeek, requestWeekChanges, validateWeek } from "@/lib/actions/weeks";

/**
 * Décision en un clic directement depuis une page de planning (Squad/Tribe/DU) :
 * pas de champ commentaire, pour que la validation reste rapide là où le
 * lead consulte déjà le planning de son équipe. La page dédiée "À valider"
 * (avec commentaire) reste disponible pour un refus/modification qui mérite
 * une explication détaillée.
 */
export function QuickDecisionButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(action: (planId: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(planId);
      if (!result.ok) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setOpen(true)}>
        Décision
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          disabled={pending}
          onClick={() => decide(validateWeek)}
        >
          ✅ Valider
        </button>
        <button
          type="button"
          className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          disabled={pending}
          onClick={() => decide(requestWeekChanges)}
        >
          🔁 Modifier
        </button>
        <button
          type="button"
          className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          disabled={pending}
          onClick={() => decide(rejectWeek)}
        >
          ❌ Refuser
        </button>
        <button type="button" className="px-1.5 py-1 text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
