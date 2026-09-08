"use client";

import { useState } from "react";
import { getAbsenceHistory, type AbsenceHistoryEvent, type AbsenceHistoryVersion } from "@/lib/actions/absence-history";
import { toast } from "@/lib/toast";

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  created: { label: "Absence créée (brouillon)", icon: "📝" },
  created_and_validated: { label: "Créée et validée directement", icon: "✓" },
  submitted: { label: "Soumise", icon: "📤" },
  resubmitted: { label: "Nouvelle soumission", icon: "📤" },
  recalled: { label: "Demande rappelée", icon: "↩️" },
  validated: { label: "Validée", icon: "✓" },
  changes_requested: { label: "Modification demandée", icon: "↩️" },
  modified_by_employee: { label: "Modifiée par le collaborateur", icon: "✏️" },
  modified_by_manager: { label: "Modifiée par le manager", icon: "✏️" },
  reopen_requested: { label: "Réouverture demandée", icon: "🔓" },
  reopen_approved: { label: "Réouverture acceptée", icon: "🔓" },
  reopen_rejected: { label: "Réouverture refusée", icon: "🚫" },
  cancellation_requested: { label: "Annulation demandée", icon: "🗑️" },
  cancellation_accepted: { label: "Annulation acceptée", icon: "🗑️" },
  cancellation_rejected: { label: "Demande d'annulation refusée", icon: "🚫" },
  manager_override: { label: "Modifiée et validée par le manager", icon: "🛠️" },
  manager_cancelled: { label: "Annulée par le manager", icon: "🗑️" },
  manager_requested_changes: { label: "Le manager demande une modification", icon: "↩️" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Panneau d'historique d'une absence — même principe visuel que `WeekHistoryButton` pour le télétravail (section 8 et 26). */
export function AbsenceHistoryButton({ absenceId, compact }: { absenceId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AbsenceHistoryEvent[] | null>(null);
  const [versions, setVersions] = useState<AbsenceHistoryVersion[] | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (events) return;
    setLoading(true);
    const result = await getAbsenceHistory(absenceId);
    setLoading(false);
    if (!result.ok) {
      toast(result.error, "error");
      setOpen(false);
      return;
    }
    setEvents(result.events);
    setVersions(result.versions);
  }

  return (
    <>
      <button
        type="button"
        className={compact ? "text-xs font-medium text-slate-400 underline hover:text-slate-600" : "btn-secondary"}
        onClick={handleOpen}
      >
        {compact ? "Historique" : "🕘 Voir l'historique"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[105] flex justify-end bg-slate-900/40" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full flex-col overflow-y-auto bg-white p-5 shadow-elevated sm:w-[440px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Historique de l&apos;absence</h2>
              <button type="button" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            {loading && <p className="text-sm text-slate-400">Chargement...</p>}
            {events && events.length === 0 && <p className="text-sm text-slate-400">Aucun historique pour le moment.</p>}

            {events && events.length > 0 && (
              <ol className="space-y-4 border-l-2 border-slate-100 pl-4">
                {events.map((e) => {
                  const meta = EVENT_LABELS[e.eventType] ?? { label: e.eventType, icon: "•" };
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-xs">{meta.icon}</span>
                      <p className="text-xs text-slate-400">{formatDateTime(e.occurredAt)}</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {meta.label}
                        {e.versionNumber ? ` · V${e.versionNumber}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {e.actorName}
                        {e.isOnBehalf ? " (a agi pour le compte du collaborateur)" : ""}
                      </p>
                      {e.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">« {e.comment} »</p>}
                    </li>
                  );
                })}
              </ol>
            )}

            {versions && versions.length > 0 && (
              <div className="mt-8 space-y-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Versions soumises</p>
                {versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <div key={v.versionNumber} className="rounded-xl border border-slate-100 p-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Version {v.versionNumber} — {v.typeName ?? "Absence"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Du {v.startDate} au {v.endDate}
                      </p>
                      <p className="text-xs text-slate-400">
                        Soumise le {formatDateTime(v.submittedAt)} par {v.submittedByName}
                        {v.isOnBehalf ? " (manager)" : ""}
                      </p>
                      {v.decision && (
                        <p className="mt-1 text-xs text-slate-500">
                          {v.decision === "validated" ? "✓ Validée" : "↩ Modification demandée"} le {v.decidedAt ? formatDateTime(v.decidedAt) : "—"} par{" "}
                          {v.decidedByName}
                        </p>
                      )}
                      {v.decisionComment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">« {v.decisionComment} »</p>}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
