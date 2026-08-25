"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAbsence, deleteAbsence, updateAbsence } from "@/lib/actions/absences";

export interface AbsenceTypeOption {
  id: string;
  name: string;
}

export interface SelfAbsenceRecord {
  id: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  comment: string | null;
}

/** Bouton + formulaire léger de déclaration d'une absence pour soi-même (section 10 du cahier des charges). */
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
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

/** Ligne d'absence FUTURE : modifiable/supprimable en place (les absences passées sont figées, section 14). */
export function EditableAbsenceRow({ absence, types }: { absence: SelfAbsenceRecord; types: AbsenceTypeOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [absenceTypeId, setAbsenceTypeId] = useState(absence.absenceTypeId);
  const [startDate, setStartDate] = useState(absence.startDate);
  const [endDate, setEndDate] = useState(absence.endDate);
  const [comment, setComment] = useState(absence.comment ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAbsence({ id: absence.id, absenceTypeId, startDate, endDate, comment: comment || null });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
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

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-rose-600" disabled={pending} onClick={handleDelete}>
          Supprimer
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select className="input" value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div />
        <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <input className="input" placeholder="Commentaire" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(false)}>
          Annuler
        </button>
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
