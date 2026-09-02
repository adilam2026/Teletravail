"use client";

import { useState } from "react";

/**
 * Petite modale dédiée (section 12 du cahier des charges "vue manager") :
 * distincte du "Valider" en un clic — un commentaire facultatif mérite un
 * champ, pas une confirmation générique.
 */
export function RequestChangesModal({
  employeeName,
  pending,
  onCancel,
  onSend,
}: {
  employeeName: string;
  pending: boolean;
  onCancel: () => void;
  onSend: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">Demander une modification à {employeeName}</h2>
        <label className="label mt-4">Commentaire (facultatif)</label>
        <textarea
          className="input min-h-[90px]"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Précisez ce qui doit être revu…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={() => onSend(comment.trim())} disabled={pending}>
            {pending ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
