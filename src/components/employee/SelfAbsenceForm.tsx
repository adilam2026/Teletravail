"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAbsence,
  deleteAbsence,
  recallAbsence,
  requestAbsenceReopen,
  submitAbsence,
  updateAbsence,
} from "@/lib/actions/absences";
import { toast } from "@/lib/toast";
import { KebabMenu } from "@/components/KebabMenu";
import { AbsenceReopenModal } from "@/components/employee/AbsenceReopenModal";
import type { AbsenceRequestKind, AbsenceStatus, ReopenRequestStatus } from "@/lib/supabase/database.types";

export interface AbsenceTypeOption {
  id: string;
  name: string;
}

export interface SelfAbsenceRecord {
  id: string;
  absenceTypeId: string;
  typeName: string | null;
  startDate: string;
  endDate: string;
  comment: string | null;
  status: AbsenceStatus;
  managerComment: string | null;
  latestRequest: { id: string; kind: AbsenceRequestKind; status: ReopenRequestStatus } | null;
}

/** Bouton + formulaire léger de déclaration d'une absence pour soi-même — crée toujours un BROUILLON (section 22), jamais auto-validée par son propre auteur. */
export function CreateSelfAbsenceForm({ employeeId, types }: { employeeId: string; types: AbsenceTypeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [absenceTypeId, setAbsenceTypeId] = useState(types[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAbsence({ employeeId, absenceTypeId, startDate, endDate, comment: comment || undefined });
      if (!result.ok) {
        setError(result.error ?? "Création impossible.");
        return;
      }
      setStartDate("");
      setEndDate("");
      setComment("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Ajouter une absence
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Type d&apos;absence</label>
          <select className="input" value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label className="label">Date de début</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Date de fin</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="label">Commentaire (optionnel)</label>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer en brouillon"}
        </button>
      </div>
    </form>
  );
}

function EditFields({
  absence,
  types,
  onChange,
}: {
  absence: { absenceTypeId: string; startDate: string; endDate: string; comment: string | null };
  types: AbsenceTypeOption[];
  onChange: (values: { absenceTypeId: string; startDate: string; endDate: string; comment: string }) => void;
}) {
  const [absenceTypeId, setAbsenceTypeId] = useState(absence.absenceTypeId);
  const [startDate, setStartDate] = useState(absence.startDate);
  const [endDate, setEndDate] = useState(absence.endDate);
  const [comment, setComment] = useState(absence.comment ?? "");

  function update(patch: Partial<{ absenceTypeId: string; startDate: string; endDate: string; comment: string }>) {
    const next = { absenceTypeId, startDate, endDate, comment, ...patch };
    if (patch.absenceTypeId !== undefined) setAbsenceTypeId(patch.absenceTypeId);
    if (patch.startDate !== undefined) setStartDate(patch.startDate);
    if (patch.endDate !== undefined) setEndDate(patch.endDate);
    if (patch.comment !== undefined) setComment(patch.comment);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <select className="input" value={absenceTypeId} onChange={(e) => update({ absenceTypeId: e.target.value })}>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div />
      <input type="date" className="input" value={startDate} onChange={(e) => update({ startDate: e.target.value })} required />
      <input type="date" className="input" value={endDate} onChange={(e) => update({ endDate: e.target.value })} required />
      <input
        className="input sm:col-span-2"
        placeholder="Commentaire"
        value={comment}
        onChange={(e) => update({ comment: e.target.value })}
      />
    </div>
  );
}

/**
 * Ligne d'absence FUTURE — les actions dépendent strictement du statut
 * (section 22 du cahier des charges "workflow congés") : jamais une
 * accumulation de boutons, une action principale + un menu "⋯" quand
 * nécessaire.
 */
export function EditableAbsenceRow({ absence, types }: { absence: SelfAbsenceRecord; types: AbsenceTypeOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reopenModal, setReopenModal] = useState<AbsenceRequestKind | null>(null);
  const [draft, setDraft] = useState({
    absenceTypeId: absence.absenceTypeId,
    startDate: absence.startDate,
    endDate: absence.endDate,
    comment: absence.comment ?? "",
  });

  function handleSaveOnly(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAbsence({ id: absence.id, ...draft, comment: draft.comment || null });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleSaveAndSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const updateResult = await updateAbsence({ id: absence.id, ...draft, comment: draft.comment || null });
      if (!updateResult.ok) {
        setError(updateResult.error ?? "Modification impossible.");
        return;
      }
      const submitResult = await submitAbsence(absence.id);
      if (!submitResult.ok) {
        setError(submitResult.error ?? "Soumission impossible.");
        return;
      }
      toast("Modifications envoyées pour validation.", "success");
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAbsence(absence.id);
      if (!result.ok) {
        setError(result.error ?? "Suppression impossible.");
        return;
      }
      router.refresh();
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitAbsence(absence.id);
      if (!result.ok) {
        setError(result.error ?? "Soumission impossible.");
        return;
      }
      router.refresh();
    });
  }

  function handleRecall() {
    setError(null);
    startTransition(async () => {
      const result = await recallAbsence(absence.id);
      if (!result.ok) {
        setError(result.error ?? "Rappel impossible.");
        return;
      }
      router.refresh();
    });
  }

  function handleSendReopen(kind: AbsenceRequestKind, reason: string) {
    startTransition(async () => {
      const result = await requestAbsenceReopen(absence.id, kind, reason || undefined);
      setReopenModal(null);
      if (!result.ok) {
        toast(result.error ?? "Demande impossible.", "error");
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    const isDraft = absence.status === "draft";
    return (
      <form onSubmit={isDraft ? handleSaveOnly : handleSaveAndSubmit} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
        <EditFields absence={draft} types={types} onChange={setDraft} />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(false)} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>
            {pending ? "Enregistrement..." : isDraft ? "Enregistrer" : "Enregistrer et soumettre"}
          </button>
        </div>
      </form>
    );
  }

  if (absence.status === "draft") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-rose-600" disabled={pending} onClick={handleDelete}>
          Supprimer
        </button>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={handleSubmit}>
          {pending ? "Envoi..." : "Soumettre"}
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  if (absence.status === "submitted") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={handleRecall}>
          {pending ? "..." : "Rappeler la demande"}
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  if (absence.status === "needs_changes") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={() => setEditing(true)}>
          Modifier
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  if (absence.status === "cancelled") {
    return null;
  }

  // validated
  const request = absence.latestRequest;
  if (request?.status === "pending") {
    return (
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-xs font-semibold text-amber-700">
          {request.kind === "cancellation" ? "Annulation demandée" : "↩ Modification demandée"}
        </span>
        <span className="text-xs text-slate-500">En attente de votre manager</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {request?.status === "rejected" && (
        <span className="text-xs text-rose-600">
          {request.kind === "cancellation" ? "Demande d'annulation refusée" : "Demande de modification refusée"}
        </span>
      )}
      <KebabMenu
        items={[
          { label: "Demander une modification", onClick: () => setReopenModal("modification") },
          { label: "Demander l'annulation", onClick: () => setReopenModal("cancellation"), tone: "danger" },
        ]}
      />
      {reopenModal && (
        <AbsenceReopenModal kind={reopenModal} pending={pending} onCancel={() => setReopenModal(null)} onSend={(reason) => handleSendReopen(reopenModal, reason)} />
      )}
    </div>
  );
}
