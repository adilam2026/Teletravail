"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAbsenceTypeTriggersReturnRule } from "@/lib/actions/absences";

export function AbsenceTypeToggle({ id, triggersReturnRule }: { id: string; triggersReturnRule: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(triggersReturnRule);
  const [pending, startTransition] = useTransition();

  function handleChange(value: boolean) {
    setChecked(value);
    startTransition(async () => {
      await setAbsenceTypeTriggersReturnRule(id, value);
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" disabled={pending} checked={checked} onChange={(e) => handleChange(e.target.checked)} />
      Déclenche la reprise
    </label>
  );
}
