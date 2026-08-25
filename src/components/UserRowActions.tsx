"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUser, resetUserPassword, setUserStatus } from "@/lib/actions/users";
import type { AccountStatus } from "@/lib/supabase/database.types";

export function UserRowActions({ userId, status, isSelf, userLabel }: { userId: string; status: AccountStatus; isSelf?: boolean; userLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPassword(userId);
      if (!result.ok) setError(result.error ?? "Erreur");
      else setTempPassword(result.temporaryPassword ?? null);
      router.refresh();
    });
  }

  function handleToggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await setUserStatus(userId, status === "active" ? "inactive" : "active");
      if (!result.ok) setError(result.error ?? "Erreur");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer définitivement le compte de ${userLabel} ? Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (!result.ok) setError(result.error ?? "Erreur");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={handleReset}>
          Réinitialiser
        </button>
        <button
          type="button"
          className={status === "active" ? "btn-secondary px-3 py-1.5 text-xs text-rose-600" : "btn-secondary px-3 py-1.5 text-xs text-emerald-600"}
          disabled={pending || (status === "active" && isSelf)}
          onClick={handleToggleStatus}
        >
          {status === "active" ? "Désactiver" : "Réactiver"}
        </button>
        {!isSelf && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-rose-700" disabled={pending} onClick={handleDelete}>
            Supprimer
          </button>
        )}
      </div>
      {tempPassword && (
        <p className="text-xs text-slate-500">
          Nouveau mot de passe : <code className="rounded bg-slate-100 px-1.5 py-0.5">{tempPassword}</code>
        </p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
