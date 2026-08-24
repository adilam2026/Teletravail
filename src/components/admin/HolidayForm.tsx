"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmHoliday, createHoliday, deleteHoliday, updateHoliday } from "@/lib/actions/holidays";
import type { PublicHolidayRow } from "@/lib/supabase/database.types";

export function CreateHolidayForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"national" | "religious" | "exceptional">("national");
  const [status, setStatus] = useState<"provisional" | "confirmed">("confirmed");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createHoliday({ name, date, type, status });
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      setName("");
      setDate("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Ajouter un jour férié
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Nom</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="national">National</option>
          <option value="religious">Religieux</option>
          <option value="exceptional">Exceptionnel</option>
        </select>
      </div>
      <div>
        <label className="label">Statut</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="confirmed">Confirmé</option>
          <option value="provisional">Prévisionnel</option>
        </select>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

export function HolidayRowActions({ holiday }: { holiday: PublicHolidayRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(holiday.date);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await confirmHoliday(holiday.id);
      router.refresh();
    });
  }

  function handleSaveDate() {
    startTransition(async () => {
      await updateHoliday(holiday.id, { date });
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteHoliday(holiday.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={handleSaveDate}>
          Enregistrer
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(false)}>
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {holiday.status === "provisional" && (
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-emerald-600" disabled={pending} onClick={handleConfirm}>
          Confirmer
        </button>
      )}
      <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={pending} onClick={() => setEditing(true)}>
        Modifier
      </button>
      <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-rose-600" disabled={pending} onClick={handleDelete}>
        Supprimer
      </button>
    </div>
  );
}
