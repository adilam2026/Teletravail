"use client";

import { useState, useTransition } from "react";
import { updateUser } from "@/lib/actions/users";
import { toast } from "@/lib/toast";

/**
 * Auto-édition du profil (section 4-5 du cahier des charges) : seuls
 * Prénom/Nom sont modifiables ici — jamais le rôle, le type, le
 * rattachement, le quota, le login. Ce n'est pas qu'une question d'UI :
 * `updateUser` ignore silencieusement tout autre champ pour un acteur qui
 * s'édite lui-même (le trigger `profiles_guard` rejette de toute façon
 * côté serveur toute tentative de changer role/squad_id/employee_type/
 * status/login sur son propre profil).
 */
export function EditOwnProfileForm({ userId, firstName, lastName }: { userId: string; firstName: string; lastName: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [displayFirstName, setDisplayFirstName] = useState(firstName);
  const [displayLastName, setDisplayLastName] = useState(lastName);
  const [firstNameInput, setFirstNameInput] = useState(firstName);
  const [lastNameInput, setLastNameInput] = useState(lastName);
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setFirstNameInput(displayFirstName);
    setLastNameInput(displayLastName);
    setError(null);
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateUser({ userId, firstName: firstNameInput.trim(), lastName: lastNameInput.trim() });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      setDisplayFirstName(firstNameInput.trim());
      setDisplayLastName(lastNameInput.trim());
      setEditing(false);
      toast("Profil mis à jour.", "success");
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Prénom</label>
          <input className="input" value={firstNameInput} onChange={(e) => setFirstNameInput(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Nom</label>
          <input className="input" value={lastNameInput} onChange={(e) => setLastNameInput(e.target.value)} required />
        </div>
        {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div>
        <dt className="text-xs font-medium text-slate-400">Prénom</dt>
        <dd className="mt-1 text-sm font-medium text-slate-800">{displayFirstName}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-slate-400">Nom</dt>
        <dd className="mt-1 text-sm font-medium text-slate-800">{displayLastName}</dd>
      </div>
      <div className="sm:col-span-2">
        <button type="button" className="btn-secondary" onClick={handleEdit}>
          Modifier mon profil
        </button>
      </div>
    </>
  );
}
