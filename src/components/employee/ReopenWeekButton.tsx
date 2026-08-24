"use client";

import { useState, useTransition } from "react";
import { requestWeekReopen } from "@/lib/actions/weeks";

export function ReopenWeekButton({ planId }: { planId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await requestWeekReopen(planId);
      setMessage(result.ok ? "Demande envoyée à votre manager." : result.error ?? "Action impossible.");
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" className="btn-secondary" disabled={pending} onClick={handleClick}>
        {pending ? "Envoi..." : "Demander une modification"}
      </button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
