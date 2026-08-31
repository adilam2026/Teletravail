"use client";

import { useState } from "react";
import { getWeekHistory, type WeekHistoryEvent, type WeekHistoryVersion } from "@/lib/actions/week-history";
import { toast } from "@/lib/toast";
import { isoWeekday } from "@/lib/rules-engine/calendar";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  day_added: { label: "Jour ajouté", icon: "➕" },
  day_removed: { label: "Jour retiré", icon: "➖" },
  day_replaced: { label: "Jour remplacé", icon: "🔁" },
  modified_by_manager: { label: "Planning modifié", icon: "✎" },
  submitted: { label: "Semaine soumise", icon: "📤" },
  resubmitted: { label: "Nouvelle soumission", icon: "📤" },
  recalled: { label: "Demande rappelée", icon: "↩️" },
  validated: { label: "Validée", icon: "✓" },
  rejected: { label: "Refusée", icon: "❌" },
  changes_requested: { label: "Modification demandée", icon: "↩️" },
  reopen_requested: { label: "Réouverture demandée", icon: "🔓" },
  reopen_approved: { label: "Réouverture acceptée", icon: "🔓" },
};

function formatDaysList(dates: string[] | null): string {
  if (!dates || dates.length === 0) return "Aucun jour";
  return dates
    .slice()
    .sort()
    .map((d) => WEEKDAY_LABELS[isoWeekday(d) - 1] ?? d)
    .join(" + ");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function WeekHistoryButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<WeekHistoryEvent[] | null>(null);
  const [versions, setVersions] = useState<WeekHistoryVersion[] | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (events) return;
    setLoading(true);
    const result = await getWeekHistory(planId);
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
      <button type="button" className="btn-secondary" onClick={handleOpen}>
        🕘 Voir l&apos;historique
      </button>
      {open && (
        <div className="fixed inset-0 z-[105] flex justify-end bg-slate-900/40" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full flex-col overflow-y-auto bg-white p-5 shadow-elevated sm:w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Historique de la semaine</h2>
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
                      <span className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-xs">
                        {meta.icon}
                      </span>
                      <p className="text-xs text-slate-400">{formatDateTime(e.occurredAt)}</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {meta.label}
                        {e.versionNumber ? ` · V${e.versionNumber}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {e.actorName}
                        {e.isOnBehalf ? " (a agi pour le compte du collaborateur)" : ""}
                      </p>
                      {(e.eventType.startsWith("day_") || e.eventType === "modified_by_manager" || e.eventType.includes("submit")) && (
                        <p className="mt-1 text-sm text-slate-600">{formatDaysList(e.daysAfter)}</p>
                      )}
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
                      <p className="text-sm font-semibold text-slate-800">Version {v.versionNumber}</p>
                      <p className="text-xs text-slate-400">
                        Soumise le {formatDateTime(v.submittedAt)} par {v.submittedByName}
                        {v.isOnBehalf ? " (manager)" : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{formatDaysList(v.days)}</p>
                      {v.decision && (
                        <p className="mt-1 text-sm">
                          {v.decision === "validated" ? "✓ Validée" : v.decision === "rejected" ? "❌ Refusée" : "↩ Modification demandée"} par{" "}
                          {v.decidedByName} · {v.decidedAt && formatDateTime(v.decidedAt)}
                        </p>
                      )}
                      {v.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">« {v.comment} »</p>}
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
