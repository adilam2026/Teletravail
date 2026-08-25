"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrganizationalUnit, createTribe, createSquad, updateOrganizationalUnit, updateTribe, updateSquad } from "@/lib/actions/org";
import type { Option } from "@/components/admin/CreateUserForm";

export function CreateOrgUnitForm({ duHeads }: { duHeads: Option[] }) {
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
      const result = await createOrganizationalUnit(name, managerId || null);
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
        + Créer une DU
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Nom de la DU</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Responsable DU</label>
        <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">—</option>
          {duHeads.map((m) => (
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

export function CreateTribeForm({ organizationalUnitId, tribeLeads }: { organizationalUnitId: string; tribeLeads: Option[] }) {
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
      const result = await createTribe(name, organizationalUnitId, managerId || null);
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
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        + Tribe
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
      <div>
        <label className="label">Nom de la Tribe</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Tribe Lead</label>
        <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">—</option>
          {tribeLeads.map((m) => (
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

export function CreateSquadForm({ tribeId, squadLeads }: { tribeId: string; squadLeads: Option[] }) {
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
      const result = await createSquad(name, tribeId, managerId || null);
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
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        + Squad
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-end gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
      <div>
        <label className="label">Nom de la Squad</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Squad Lead</label>
        <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">—</option>
          {squadLeads.map((m) => (
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

export function OrgUnitManagerSelect({ id, name, currentManagerId, options }: { id: string; name: string; currentManagerId: string | null; options: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentManagerId ?? "");

  function handleChange(newValue: string) {
    setValue(newValue);
    startTransition(async () => {
      await updateOrganizationalUnit(id, name, newValue || null);
      router.refresh();
    });
  }

  return (
    <select className="input" value={value} disabled={pending} onChange={(e) => handleChange(e.target.value)}>
      <option value="">—</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

export function TribeManagerSelect({ id, name, currentManagerId, options }: { id: string; name: string; currentManagerId: string | null; options: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentManagerId ?? "");

  function handleChange(newValue: string) {
    setValue(newValue);
    startTransition(async () => {
      await updateTribe(id, name, newValue || null);
      router.refresh();
    });
  }

  return (
    <select className="input" value={value} disabled={pending} onChange={(e) => handleChange(e.target.value)}>
      <option value="">—</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

export function SquadManagerSelect({ id, name, currentManagerId, options }: { id: string; name: string; currentManagerId: string | null; options: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentManagerId ?? "");

  function handleChange(newValue: string) {
    setValue(newValue);
    startTransition(async () => {
      await updateSquad(id, name, newValue || null);
      router.refresh();
    });
  }

  return (
    <select className="input" value={value} disabled={pending} onChange={(e) => handleChange(e.target.value)}>
      <option value="">—</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
