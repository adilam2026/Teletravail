"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAbsence } from "@/lib/actions/absences";

export interface AbsenceFormMember {
  id: string;
  name: string;
}

export interface AbsenceFormType {
  id: string;
  name: string;
}

export function CreateAbsenceForm({ members, types }: { members: AbsenceFormMember[]; types: AbsenceFormType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState(members[0]?.id ?? "");
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
        setError(result.error ?? "Erreur");
        return;
      }
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setComment("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Déclarer une absence
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Collaborateur</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type d&apos;absence</label>
          <select className="input" value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
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
        <label className="label">Commentaire</label>
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
