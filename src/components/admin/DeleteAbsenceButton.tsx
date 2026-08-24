"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAbsence } from "@/lib/actions/absences";

export function DeleteAbsenceButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteAbsence(id);
          router.refresh();
        })
      }
    >
      Supprimer
    </button>
  );
}
