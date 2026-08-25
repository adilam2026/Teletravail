"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/actions/users";
import type { EmployeeTypeCode } from "@/lib/supabase/database.types";

export function CreateEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [employeeType, setEmployeeType] = useState<EmployeeTypeCode>("internal");

  function reset() {
    setFirstName("");
    setLastName("");
    setLogin("");
    setEmail("");
    setEmployeeType("internal");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser({ firstName, lastName, login, email: email || undefined, role: "employee", employeeType });
      if (!result.ok) {
        setError(result.error ?? "Création impossible.");
        return;
      }
      setTempPassword(result.temporaryPassword ?? null);
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Ajouter un collaborateur
      </button>
    );
  }

  return (
    <div className="card space-y-4">
      {tempPassword ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Compte créé.</p>
          <p className="mt-1">
            Mot de passe provisoire : <code className="rounded bg-white px-2 py-0.5">{tempPassword}</code>
          </p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => {
              setTempPassword(null);
              setOpen(false);
            }}
          >
            Fermer
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Prénom</label>
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Identifiant</label>
              <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />
            </div>
            <div>
              <label className="label">Email (optionnel)</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={employeeType} onChange={(e) => setEmployeeType(e.target.value as EmployeeTypeCode)}>
                <option value="internal">Interne (2 j/semaine)</option>
                <option value="external">Externe (1 j/semaine)</option>
              </select>
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Création..." : "Créer le compte"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
