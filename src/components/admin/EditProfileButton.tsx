"use client";

import { useState, useTransition } from "react";
import { updateUser } from "@/lib/actions/users";
import { toast } from "@/lib/toast";

export interface SquadOption {
  id: string;
  /** Libellé groupé "DU / Tribe / Squad" pour se repérer dans le picker (section 1 : DU, Tribe, Squad). */
  label: string;
}

export interface EditProfileButtonProps {
  userId: string;
  firstName: string;
  lastName: string;
  /** Omis (ou vide) pour une cible non-collaborateur (Squad/Tribe Lead, DU Head) : la réaffectation de Squad ne les concerne pas — leur "affectation" est l'unité qu'ils dirigent, pas `squad_id`. */
  squadOptions?: SquadOption[];
  currentSquadId?: string | null;
  statusBadge?: React.ReactNode;
}

/**
 * Nom éditable d'un profil, avec le déclencheur "Modifier le profil" juste
 * en dessous — ce composant REND le nom lui-même (pas seulement le
 * bouton) : c'est ce qui permet une mise à jour immédiate à l'écran après
 * enregistrement, sans recharger la page ni router.refresh() global
 * (section 7 du cahier des charges). `updateUser` revalide indépendamment
 * le périmètre de l'acteur côté serveur — cette UI ne fait que refléter le
 * même périmètre pour ne pas proposer un choix qui serait de toute façon
 * refusé.
 */
export function EditProfileButton({ userId, firstName, lastName, squadOptions, currentSquadId, statusBadge }: EditProfileButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [displayFirstName, setDisplayFirstName] = useState(firstName);
  const [displayLastName, setDisplayLastName] = useState(lastName);
  const [displaySquadId, setDisplaySquadId] = useState(currentSquadId ?? "");

  const [firstNameInput, setFirstNameInput] = useState(firstName);
  const [lastNameInput, setLastNameInput] = useState(lastName);
  const [squadInput, setSquadInput] = useState(currentSquadId ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasSquadPicker = !!squadOptions && squadOptions.length > 0;
  const currentSquadLabel = hasSquadPicker ? squadOptions.find((s) => s.id === displaySquadId)?.label : undefined;

  function handleOpen() {
    setFirstNameInput(displayFirstName);
    setLastNameInput(displayLastName);
    setSquadInput(displaySquadId);
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateUser({
        userId,
        firstName: firstNameInput.trim(),
        lastName: lastNameInput.trim(),
        ...(hasSquadPicker ? { squadId: squadInput || null } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      // Mise à jour immédiate côté client, pas de router.refresh() global.
      setDisplayFirstName(firstNameInput.trim());
      setDisplayLastName(lastNameInput.trim());
      if (hasSquadPicker) setDisplaySquadId(squadInput);
      setOpen(false);
      toast("Profil mis à jour.", "success");
    });
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-900">
        {displayFirstName} {displayLastName}
        {statusBadge}
      </p>
      {currentSquadLabel && <p className="text-xs text-slate-400">{currentSquadLabel}</p>}

      {!open ? (
        <button type="button" className="mt-1 text-xs font-medium text-brand-600 underline" onClick={handleOpen}>
          Modifier le profil
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-2 w-full max-w-sm space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Prénom</label>
              <input className="input" value={firstNameInput} onChange={(e) => setFirstNameInput(e.target.value)} required />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input" value={lastNameInput} onChange={(e) => setLastNameInput(e.target.value)} required />
            </div>
          </div>
          {hasSquadPicker && (
            <div>
              <label className="label">Affectation (Squad)</label>
              <select className="input" value={squadInput} onChange={(e) => setSquadInput(e.target.value)} required>
                <option value="" disabled>
                  Choisir une Squad…
                </option>
                {squadOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
