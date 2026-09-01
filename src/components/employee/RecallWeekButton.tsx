"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recallWeek } from "@/lib/actions/weeks";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export function RecallWeekButton({
  planId,
  onOptimistic,
  onSuccess,
}: {
  planId: string;
  /** Appelé juste après confirmation, avant la réponse serveur — UI optimiste (section 13). */
  onOptimistic?: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    const confirmed = await confirmDialog({
      title: "Rappeler cette semaine pour la modifier ?",
      confirmLabel: "Rappeler",
      cancelLabel: "Annuler",
    });
    if (!confirmed) return;

    onOptimistic?.();

    startTransition(() => {
      recallWeek(planId).then((result) => {
        if (!result.ok) {
          // Échec possible par course avec une décision manager concurrente
          // (section 6) : le statut réel a pu changer entre-temps, donc on
          // recharge toujours dans ce cas précis, même en vue mensuelle.
          toast(result.error ?? "Rappel impossible.", "error");
          router.refresh();
          return;
        }
        toast("Semaine rappelée : vous pouvez la modifier.", "success");
        if (onSuccess) onSuccess();
        else if (!onOptimistic) router.refresh();
      });
    });
  }

  return (
    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={handleClick}>
      {pending ? "Rappel..." : "Rappeler ma demande"}
    </button>
  );
}
