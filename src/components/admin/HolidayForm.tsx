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
  const [durationDays, setDurationDays] = useState(1);
  const [type, setType] = useState<"national" | "religious" | "exceptional">("national");
  const [status, setStatus] = useState<"provisional" | "confirmed">("confirmed");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createHoliday({ name, date, type, status, durationDays });
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      setName("");
      setDate("");
      setDurationDays(1);
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
        <label className="label">Date de début</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">Nombre de jours chômés</label>
        <input
          type="number"
          min={1}
          max={10}
          className="input w-24"
          value={durationDays}
          onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
        />
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
  const [extraDays, setExtraDays] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      await confirmHoliday(holiday.id);
      router.refresh();
    });
  }

  function handleSaveDate() {
    setError(null);
    startTransition(async () => {
      const result = await updateHoliday(holiday.id, { date, durationDays: extraDays });
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      setEditing(false);
      setExtraDays(1);
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
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={10}
              className="input w-20"
              value={extraDays}
              onChange={(e) => setExtraDays(Math.max(1, Number(e.target.value)))}
              title="Nombre total de jours chômés à partir de cette date (ajoute des jours supplémentaires sans toucher aux jours déjà enregistrés)"
            />
            <span className="text-xs text-slate-400">jour(s) total (ajout seulement)</span>
          </div>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={handleSaveDate}>
            Enregistrer
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Annuler
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
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
