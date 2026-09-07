"use client";

import { useState, useTransition } from "react";
import { requestWeekReopen } from "@/lib/actions/weeks";
import type { LatestReopenRequest } from "@/lib/data/planning";

/**
 * Petite modale dédiée à la demande de réouverture (section "Demande de
 * modification d'une semaine déjà validée") : un motif facultatif, jamais un
 * simple clic silencieux — la demande doit rester traçable côté manager.
 */
function ReopenRequestModal({
  pending,
  onCancel,
  onSend,
}: {
  pending: boolean;
  onCancel: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">Demander la modification de cette semaine</h2>
        <label className="label mt-4">Motif de la modification (facultatif)</label>
        <textarea
          className="input min-h-[90px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Précisez pourquoi cette semaine validée doit être revue…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={() => onSend(reason.trim())} disabled={pending}>
            {pending ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * État persistant et exploitable côté manager (section "ne pas se contenter
 * d'un message qui disparaît") : une fois envoyée, la demande reste visible
 * ici tant qu'elle n'a pas été traitée — jamais un simple toast éphémère.
 */
export function ReopenWeekButton({ planId, latestReopenRequest }: { planId: string; latestReopenRequest: LatestReopenRequest | null }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [localRequest, setLocalRequest] = useState<LatestReopenRequest | null>(latestReopenRequest);
  const [error, setError] = useState<string | null>(null);

  function handleSend(reason: string) {
    setError(null);
    startTransition(async () => {
      const result = await requestWeekReopen(planId, reason || undefined);
      if (result.ok) {
        setLocalRequest({ id: "optimistic", status: "pending", reason: reason || null });
        setOpen(false);
      } else {
        setError(result.error ?? "Action impossible.");
      }
    });
  }

  if (localRequest?.status === "pending") {
    return (
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-xs font-semibold text-amber-700">↩ Modification demandée</span>
        <span className="text-xs text-slate-500">En attente de l&apos;autorisation de votre manager</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {localRequest?.status === "rejected" && <span className="text-xs text-rose-600">Demande de modification refusée</span>}
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(true)}>
        Demander une modification
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {open && <ReopenRequestModal pending={pending} onCancel={() => setOpen(false)} onSend={handleSend} />}
    </div>
  );
}
