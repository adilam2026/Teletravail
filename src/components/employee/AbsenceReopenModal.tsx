"use client";

import { useState } from "react";
import type { AbsenceRequestKind } from "@/lib/supabase/database.types";

const COPY: Record<AbsenceRequestKind, { title: string; label: string; placeholder: string; confirm: string }> = {
  modification: {
    title: "Demander la modification de cette absence",
    label: "Motif de la modification (facultatif)",
    placeholder: "Précisez pourquoi cette absence doit être revue…",
    confirm: "Envoyer la demande",
  },
  cancellation: {
    title: "Demander l'annulation de cette absence ?",
    label: "Motif (facultatif)",
    placeholder: "Précisez pourquoi cette absence doit être annulée…",
    confirm: "Confirmer la demande",
  },
};

/**
 * Modale partagée modification/annulation (sections 5 et 9 du cahier des
 * charges "workflow congés") : même mécanique, seul le texte change — après
 * envoi, l'absence reste Validée et inchangée tant que le manager n'a pas
 * tranché, jamais une action silencieuse.
 */
export function AbsenceReopenModal({
  kind,
  pending,
  onCancel,
  onSend,
}: {
  kind: AbsenceRequestKind;
  pending: boolean;
  onCancel: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const copy = COPY[kind];

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">{copy.title}</h2>
        <label className="label mt-4">{copy.label}</label>
        <textarea className="input min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={copy.placeholder} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={() => onSend(reason.trim())} disabled={pending}>
            {pending ? "Envoi..." : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
