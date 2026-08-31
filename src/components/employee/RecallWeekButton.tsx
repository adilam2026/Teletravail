"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recallWeek } from "@/lib/actions/weeks";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export function RecallWeekButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    const confirmed = await confirmDialog({
      title: "Rappeler cette semaine pour la modifier ?",
      confirmLabel: "Rappeler",
      cancelLabel: "Annuler",
    });
    if (!confirmed) return;

    startTransition(() => {
      recallWeek(planId).then((result) => {
        if (!result.ok) {
          toast(result.error ?? "Rappel impossible.", "error");
        } else {
          toast("Semaine rappelée : vous pouvez la modifier.", "success");
        }
        router.refresh();
      });
    });
  }

  return (
    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={handleClick}>
      {pending ? "Rappel..." : "Rappeler ma demande"}
    </button>
  );
}
