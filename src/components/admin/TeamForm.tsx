"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeam, updateTeam } from "@/lib/actions/teams";
import type { Option } from "@/components/admin/CreateUserForm";

export function CreateTeamForm({ managers }: { managers: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTeam(name, managerId || null);
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      setName("");
      setManagerId("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Créer une équipe
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Nom de l&apos;équipe</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Manager</label>
        <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">—</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
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

export function TeamManagerSelect({
  teamId,
  teamName,
  currentManagerId,
  managers,
}: {
  teamId: string;
  teamName: string;
  currentManagerId: string | null;
  managers: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentManagerId ?? "");

  function handleChange(newValue: string) {
    setValue(newValue);
    startTransition(async () => {
      await updateTeam(teamId, teamName, newValue || null);
      router.refresh();
    });
  }

  return (
    <select className="input" value={value} disabled={pending} onChange={(e) => handleChange(e.target.value)}>
      <option value="">—</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
