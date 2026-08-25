"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recallWeek } from "@/lib/actions/weeks";

export function RecallWeekButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Rappeler cette semaine ? Elle repassera en brouillon et ne sera plus soumise à validation.")) return;
    startTransition(() => {
      recallWeek(planId).then((result) => {
        if (!result.ok) window.alert(result.error ?? "Action impossible.");
        router.refresh();
      });
    });
  }

  return (
    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={handleClick}>
      {pending ? "Rappel..." : "Rappeler cette semaine"}
    </button>
  );
}
