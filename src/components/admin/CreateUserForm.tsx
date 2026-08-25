"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/actions/users";
import type { AppRole, EmployeeTypeCode } from "@/lib/supabase/database.types";

export interface Option {
  id: string;
  label: string;
}

export interface OrgUnitOption {
  id: string;
  name: string;
  managerId: string | null;
}

export interface TribeOption {
  id: string;
  name: string;
  organizationalUnitId: string;
  managerId: string | null;
  duName: string;
}

export interface SquadOption {
  id: string;
  name: string;
  tribeId: string;
  managerId: string | null;
  tribeName: string;
  duName: string;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "employee", label: "Collaborateur" },
  { value: "squad_lead", label: "Squad Lead" },
  { value: "tribe_lead", label: "Tribe Lead" },
  { value: "du_head", label: "Responsable DU" },
  { value: "admin", label: "Administrateur" },
];

export function CreateUserForm({
  organizationalUnits,
  tribes,
  squads,
}: {
  organizationalUnits: OrgUnitOption[];
  tribes: TribeOption[];
  squads: SquadOption[];
}) {
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

  // Collaborateur
  const [squadId, setSquadId] = useState("");
  // Squad Lead
  const [squadLeadTribeId, setSquadLeadTribeId] = useState("");
  const [squadMode, setSquadMode] = useState<"existing" | "new">("new");
  const [claimSquadId, setClaimSquadId] = useState("");
  const [newSquadName, setNewSquadName] = useState("");
  // Tribe Lead
  const [tribeLeadOrgUnitId, setTribeLeadOrgUnitId] = useState("");
  const [tribeMode, setTribeMode] = useState<"existing" | "new">("new");
  const [claimTribeId, setClaimTribeId] = useState("");
  const [newTribeName, setNewTribeName] = useState("");
  // DU Head
  const [orgUnitMode, setOrgUnitMode] = useState<"existing" | "new">("new");
  const [claimOrgUnitId, setClaimOrgUnitId] = useState("");
  const [newOrgUnitName, setNewOrgUnitName] = useState("");

  const squadOptionsForEmployee = useMemo(
    () => squads.map((s) => ({ id: s.id, label: `${s.duName} / ${s.tribeName} / ${s.name}` })),
    [squads],
  );
  const tribeOptionsFlat = useMemo(() => tribes.map((t) => ({ id: t.id, label: `${t.duName} / ${t.name}` })), [tribes]);
  const vacantSquadsForTribe = useMemo(
    () => squads.filter((s) => s.tribeId === squadLeadTribeId && !s.managerId).map((s) => ({ id: s.id, label: s.name })),
    [squads, squadLeadTribeId],
  );
  const vacantTribesForDu = useMemo(
    () => tribes.filter((t) => t.organizationalUnitId === tribeLeadOrgUnitId && !t.managerId).map((t) => ({ id: t.id, label: t.name })),
    [tribes, tribeLeadOrgUnitId],
  );
  const vacantOrgUnits = useMemo(() => organizationalUnits.filter((u) => !u.managerId).map((u) => ({ id: u.id, label: u.name })), [organizationalUnits]);

  function reset() {
    setFirstName("");
    setLastName("");
    setLogin("");
    setEmail("");
    setSquadId("");
    setSquadLeadTribeId("");
    setClaimSquadId("");
    setNewSquadName("");
    setTribeLeadOrgUnitId("");
    setClaimTribeId("");
    setNewTribeName("");
    setClaimOrgUnitId("");
    setNewOrgUnitName("");
  }

  function buildPayload() {
    return {
      firstName,
      lastName,
      login,
      email: email || undefined,
      role,
      employeeType,
      squadId: role === "employee" ? squadId || null : role === "squad_lead" && squadMode === "existing" ? claimSquadId || null : null,
      newSquadName: role === "squad_lead" && squadMode === "new" ? newSquadName || undefined : undefined,
      tribeId:
        role === "squad_lead" ? squadLeadTribeId || undefined : role === "tribe_lead" && tribeMode === "existing" ? claimTribeId || undefined : undefined,
      newTribeName: role === "tribe_lead" && tribeMode === "new" ? newTribeName || undefined : undefined,
      organizationalUnitId:
        role === "tribe_lead" ? tribeLeadOrgUnitId || undefined : role === "du_head" && orgUnitMode === "existing" ? claimOrgUnitId || undefined : undefined,
      newOrgUnitName: role === "du_head" && orgUnitMode === "new" ? newOrgUnitName || undefined : undefined,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser(buildPayload());
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
              <label className="label">Niveau hiérarchique</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Profil télétravail</label>
              <select className="input" value={employeeType} onChange={(e) => setEmployeeType(e.target.value as EmployeeTypeCode)}>
                <option value="internal">Interne (2 j/semaine)</option>
                <option value="external">Externe (1 j/semaine)</option>
              </select>
            </div>

            {role === "employee" && (
              <div>
                <label className="label">Squad de rattachement</label>
                <select className="input" value={squadId} onChange={(e) => setSquadId(e.target.value)} required>
                  <option value="">—</option>
                  {squadOptionsForEmployee.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role === "squad_lead" && (
              <>
                <div>
                  <label className="label">Tribe de rattachement</label>
                  <select
                    className="input"
                    value={squadLeadTribeId}
                    onChange={(e) => {
                      setSquadLeadTribeId(e.target.value);
                      setClaimSquadId("");
                    }}
                    required
                  >
                    <option value="">—</option>
                    {tribeOptionsFlat.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Squad</label>
                  <div className="flex gap-3 pb-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={squadMode === "new"} onChange={() => setSquadMode("new")} /> Nouvelle Squad
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={squadMode === "existing"} onChange={() => setSquadMode("existing")} /> Squad existante (sans lead)
                    </label>
                  </div>
                  {squadMode === "new" ? (
                    <input className="input" placeholder="Nom de la nouvelle Squad" value={newSquadName} onChange={(e) => setNewSquadName(e.target.value)} required />
                  ) : (
                    <select className="input" value={claimSquadId} onChange={(e) => setClaimSquadId(e.target.value)} required>
                      <option value="">—</option>
                      {vacantSquadsForTribe.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            {role === "tribe_lead" && (
              <>
                <div>
                  <label className="label">DU de rattachement</label>
                  <select
                    className="input"
                    value={tribeLeadOrgUnitId}
                    onChange={(e) => {
                      setTribeLeadOrgUnitId(e.target.value);
                      setClaimTribeId("");
                    }}
                    required
                  >
                    <option value="">—</option>
                    {organizationalUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tribe</label>
                  <div className="flex gap-3 pb-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={tribeMode === "new"} onChange={() => setTribeMode("new")} /> Nouvelle Tribe
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={tribeMode === "existing"} onChange={() => setTribeMode("existing")} /> Tribe existante (sans lead)
                    </label>
                  </div>
                  {tribeMode === "new" ? (
                    <input className="input" placeholder="Nom de la nouvelle Tribe" value={newTribeName} onChange={(e) => setNewTribeName(e.target.value)} required />
                  ) : (
                    <select className="input" value={claimTribeId} onChange={(e) => setClaimTribeId(e.target.value)} required>
                      <option value="">—</option>
                      {vacantTribesForDu.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            {role === "du_head" && (
              <div>
                <label className="label">DU</label>
                <div className="flex gap-3 pb-1 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={orgUnitMode === "new"} onChange={() => setOrgUnitMode("new")} /> Nouvelle DU
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={orgUnitMode === "existing"} onChange={() => setOrgUnitMode("existing")} /> DU existante (sans responsable)
                  </label>
                </div>
                {orgUnitMode === "new" ? (
                  <input className="input" placeholder="Nom de la nouvelle DU" value={newOrgUnitName} onChange={(e) => setNewOrgUnitName(e.target.value)} required />
                ) : (
                  <select className="input" value={claimOrgUnitId} onChange={(e) => setClaimOrgUnitId(e.target.value)} required>
                    <option value="">—</option>
                    {vacantOrgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                )}
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
