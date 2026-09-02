"use client";

import { useEffect, useState } from "react";
import { getWeekHistory, type WeekHistoryEvent, type WeekHistoryVersion } from "@/lib/actions/week-history";
import type { AppRole } from "@/lib/supabase/database.types";
import type { GroupDayKind } from "@/lib/data/hierarchy";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  submitted: { label: "Semaine soumise", icon: "📤" },
  resubmitted: { label: "Nouvelle soumission", icon: "📤" },
  recalled: { label: "Demande rappelée", icon: "↩️" },
  validated: { label: "Validée", icon: "✓" },
  rejected: { label: "Refusée", icon: "❌" },
  changes_requested: { label: "Modification demandée", icon: "↩️" },
  reopen_requested: { label: "Réouverture demandée", icon: "🔓" },
  reopen_approved: { label: "Réouverture acceptée", icon: "🔓" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export interface EmployeeDrawerData {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  employeeType: "internal" | "external" | null;
  squadName: string | null;
  planId: string | null;
  days: { date: string; icon: string; label: string; kind: GroupDayKind }[];
  managerComment: string | null;
}

/**
 * Panneau secondaire (section 22-24 du cahier des charges "vue manager") :
 * les infos déjà connues (nom, rôle, semaine) s'affichent immédiatement —
 * seul l'historique détaillé est chargé à l'ouverture, jamais préchargé pour
 * chaque ligne du tableau (coût réservé à qui l'ouvre réellement).
 */
export function EmployeeDrawer({ data, onClose }: { data: EmployeeDrawerData; onClose: () => void }) {
  const [loading, setLoading] = useState(!!data.planId);
  const [events, setEvents] = useState<WeekHistoryEvent[]>([]);
  const [versions, setVersions] = useState<WeekHistoryVersion[]>([]);

  useEffect(() => {
    if (!data.planId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getWeekHistory(data.planId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setEvents(result.events);
        setVersions(result.versions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data.planId]);

  return (
    <div className="fixed inset-0 z-[105] flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="flex h-full w-full flex-col overflow-y-auto bg-white p-5 shadow-elevated sm:w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {data.firstName} {data.lastName}
            </h2>
            <p className="text-xs text-slate-400">
              {ROLE_LABELS[data.role]}
              {data.employeeType && ` · ${data.employeeType === "internal" ? "Interne" : "Externe"}`}
              {data.squadName && ` · ${data.squadName}`}
            </p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cette semaine</p>
          <div className="grid grid-cols-5 gap-1.5">
            {data.days.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-0.5 rounded-lg bg-slate-50 px-1 py-2 text-center">
                <span className="text-base leading-none">{d.icon}</span>
                <span className="text-[10px] font-medium leading-tight text-slate-600">{d.label}</span>
              </div>
            ))}
          </div>
          {data.managerComment && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">« {data.managerComment} »</p>}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historique</p>
        {loading && <p className="text-sm text-slate-400">Chargement...</p>}
        {!loading && !data.planId && <p className="text-sm text-slate-400">Aucune semaine soumise pour le moment.</p>}
        {!loading && events.length === 0 && data.planId && <p className="text-sm text-slate-400">Aucun historique pour le moment.</p>}

        {!loading && events.length > 0 && (
          <ol className="space-y-3 border-l-2 border-slate-100 pl-4">
            {events.map((e) => {
              const meta = EVENT_LABELS[e.eventType] ?? { label: e.eventType, icon: "•" };
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-xs">{meta.icon}</span>
                  <p className="text-xs text-slate-400">{formatDateTime(e.occurredAt)}</p>
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  <p className="text-xs text-slate-500">{e.actorName}</p>
                  {e.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">« {e.comment} »</p>}
                </li>
              );
            })}
          </ol>
        )}

        {!loading && versions.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Versions soumises</p>
            {versions
              .slice()
              .reverse()
              .map((v) => (
                <div key={v.versionNumber} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-semibold text-slate-800">Version {v.versionNumber}</p>
                  <p className="text-xs text-slate-400">Soumise le {formatDateTime(v.submittedAt)} par {v.submittedByName}</p>
                  {v.decision && (
                    <p className="mt-1 text-sm">
                      {v.decision === "validated" ? "✓ Validée" : v.decision === "rejected" ? "❌ Refusée" : "↩ Modification demandée"} par {v.decidedByName}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
