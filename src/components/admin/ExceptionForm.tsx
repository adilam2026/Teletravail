"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createException, deleteException } from "@/lib/actions/exceptions";
import type { ExceptionScopeCode, ExceptionTypeCode } from "@/lib/supabase/database.types";
import type { Option } from "@/components/admin/CreateUserForm";

const TYPE_OPTIONS: { value: ExceptionTypeCode; label: string }[] = [
  { value: "mandatory_office", label: "Présence obligatoire" },
  { value: "telework_forbidden", label: "Télétravail interdit" },
  { value: "telework_allowed", label: "Télétravail exceptionnellement autorisé" },
  { value: "site_closure", label: "Fermeture de site" },
  { value: "company_event", label: "Événement d'entreprise" },
  { value: "seminar", label: "Séminaire" },
  { value: "custom_period", label: "Période particulière" },
];

export function CreateExceptionForm({ squads, employees }: { squads: Option[]; employees: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<ExceptionTypeCode>("mandatory_office");
  const [scope, setScope] = useState<ExceptionScopeCode>("company");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [squadId, setSquadId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createException({ name, type, scope, startDate, endDate, squadId: squadId || null, employeeId: employeeId || null, comment: comment || undefined });
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      setName("");
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
        + Créer une exception
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nom</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ExceptionTypeCode)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
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
        <div>
          <label className="label">Périmètre</label>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as ExceptionScopeCode)}>
            <option value="company">Toute l&apos;entreprise</option>
            <option value="squad">Une Squad</option>
            <option value="employee">Un collaborateur</option>
          </select>
        </div>
        {scope === "squad" && (
          <div>
            <label className="label">Squad</label>
            <select className="input" value={squadId} onChange={(e) => setSquadId(e.target.value)}>
              <option value="">—</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {scope === "employee" && (
          <div>
            <label className="label">Collaborateur</label>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
          Créer
        </button>
      </div>
    </form>
  );
}

export function DeleteExceptionButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteException(id);
          router.refresh();
        })
      }
    >
      Supprimer
    </button>
  );
}
