"use client";

import { useEffect, useState } from "react";
import { onConfirmRequest, resolveConfirm, type ConfirmRequest } from "@/lib/confirm";

/** Hôte global de la modale de confirmation applicative — monté une fois dans le layout racine. */
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => onConfirmRequest(setRequest), []);

  if (!request) return null;

  function respond(result: boolean) {
    if (!request) return;
    resolveConfirm(request.id, result);
    setRequest(null);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated">
        <p className="text-base font-semibold text-slate-900">{request.title}</p>
        {request.message && <p className="mt-2 text-sm text-slate-500">{request.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => respond(false)}>
            {request.cancelLabel ?? "Annuler"}
          </button>
          <button
            type="button"
            className={request.variant === "danger" ? "btn-primary bg-rose-600 hover:bg-rose-700" : "btn-primary"}
            onClick={() => respond(true)}
          >
            {request.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
