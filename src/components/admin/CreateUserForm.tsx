"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/actions/users";
import type { AppRole, EmployeeTypeCode } from "@/lib/supabase/database.types";

export interface Option {
  id: string;
  label: string;
}

export function CreateUserForm({ teams, managers }: { teams: Option[]; managers: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("employee");
  const [employeeType, setEmployeeType] = useState<EmployeeTypeCode>("internal");
  const [teamId, setTeamId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  function reset() {
    setFirstName("");
    setLastName("");
    setLogin("");
    setEmail("");
    setTeamId("");
    setManagerId("");
    setNewTeamName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser({
        firstName,
        lastName,
        login,
        email: email || undefined,
        role,
        employeeType: role === "employee" ? employeeType : undefined,
        teamId: role === "employee" ? teamId || null : null,
        managerId: role === "employee" ? managerId || null : null,
        newTeamName: role === "manager" ? newTeamName || undefined : undefined,
      });
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
        + Créer un utilisateur
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
              <label className="label">Rôle</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                <option value="employee">Collaborateur</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            {role === "employee" && (
              <>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={employeeType} onChange={(e) => setEmployeeType(e.target.value as EmployeeTypeCode)}>
                    <option value="internal">Interne (2 j/semaine)</option>
                    <option value="external">Externe (1 j/semaine)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Équipe</label>
                  <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
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
              </>
            )}

            {role === "manager" && (
              <div>
                <label className="label">Nom de l&apos;équipe (créée automatiquement)</label>
                <input className="input" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Équipe de..." />
              </div>
            )}
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
