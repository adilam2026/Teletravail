"use client";

import { useState } from "react";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import { validateWeek, requestWeekChanges } from "@/lib/actions/weeks";
import { toast } from "@/lib/toast";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus, AppRole } from "@/lib/supabase/database.types";
import type { TeamPresenceDay } from "@/lib/rules-engine/types";
import type { GroupDayKind } from "@/lib/data/hierarchy";
import { RequestChangesModal } from "@/components/manager/RequestChangesModal";
import { EmployeeDrawer, type EmployeeDrawerData } from "@/components/manager/EmployeeDrawer";

export interface TeamPlanningMember {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  employeeType: "internal" | "external" | null;
  squadName: string | null;
  planId: string | null;
  status: PlanStatus | "not_submitted";
  managerComment: string | null;
  days: { date: string; icon: string; label: string; kind: GroupDayKind }[];
}

type FilterKey = "all" | "pending" | "validated" | "draft" | "needs_changes";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "pending", label: "À valider" },
  { key: "validated", label: "Validés" },
  { key: "draft", label: "Brouillons" },
  { key: "needs_changes", label: "À modifier" },
];

function matchesFilter(status: PlanStatus | "not_submitted", filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return status === "submitted";
  if (filter === "validated") return status === "validated";
  if (filter === "draft") return status === "draft" || status === "not_submitted";
  return status === "needs_changes";
}

function formatDayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** Tons sobres, cohérents avec Planning — le TT "demandé" (pas encore validé) reste discret (bordure en pointillé), jamais une couleur agressive supplémentaire (section 8). */
function cellTone(kind: GroupDayKind, rowStatus: PlanStatus | "not_submitted"): string {
  if (kind === "telework") {
    return rowStatus === "validated" ? "bg-brand-50 text-brand-700" : "border border-dashed border-brand-200 bg-brand-50/40 text-brand-500";
  }
  if (kind === "office") return "bg-white text-slate-500";
  if (kind === "absence_leave") return "bg-emerald-50 text-emerald-700";
  if (kind === "absence_sick") return "bg-rose-50 text-rose-700";
  if (kind === "absence_other") return "bg-slate-100 text-slate-600";
  if (kind === "holiday") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

function toDrawerData(m: TeamPlanningMember): EmployeeDrawerData {
  return {
    employeeId: m.employeeId,
    firstName: m.firstName,
    lastName: m.lastName,
    role: m.role,
    employeeType: m.employeeType,
    squadName: m.squadName,
    planId: m.planId,
    days: m.days,
    managerComment: m.managerComment,
  };
}

const LEGEND: { icon: string; label: string }[] = [
  { icon: "🏠", label: "Télétravail" },
  { icon: "🏢", label: "Bureau" },
  { icon: "🌴", label: "Absence" },
  { icon: "🇲🇦", label: "Jour férié" },
];

/**
 * Planning consolidé de l'équipe avec validation directe (section 6-14 du
 * cahier des charges "vue manager") : capitalise sur le langage visuel de
 * `PlanningCalendar` (blocs de couleur plats, pas de tableau Excel) mais
 * avec les collaborateurs en lignes plutôt que les semaines — un seul
 * composant, réutilisé identique pour Squad Lead / Tribe Lead / Responsable
 * DU (section 21), seul le périmètre de `members` change selon l'appelant.
 * Validation optimiste (section 25) : aucun `router.refresh()` après une
 * décision, l'état local fait foi immédiatement, la mutation part en
 * arrière-plan.
 */
export function TeamPlanningBoard({ members, presence }: { members: TeamPlanningMember[]; presence: TeamPresenceDay[] }) {
  const [overrides, setOverrides] = useState<Map<string, PlanStatus | "not_submitted">>(new Map());
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [modalTarget, setModalTarget] = useState<TeamPlanningMember | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<TeamPlanningMember | null>(null);

  function statusOf(m: TeamPlanningMember): PlanStatus | "not_submitted" {
    return overrides.get(m.employeeId) ?? m.status;
  }

  function setRowPending(id: string, val: boolean) {
    setPendingRows((prev) => {
      const next = new Set(prev);
      if (val) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleValidate(m: TeamPlanningMember) {
    if (!m.planId) return;
    const previous = statusOf(m);
    setOverrides((prev) => new Map(prev).set(m.employeeId, "validated"));
    setRowPending(m.employeeId, true);
    validateWeek(m.planId).then((result) => {
      setRowPending(m.employeeId, false);
      if (!result.ok) {
        setOverrides((prev) => new Map(prev).set(m.employeeId, previous));
        toast(result.error ?? "Validation impossible.", "error");
        return;
      }
      toast(`Semaine de ${m.firstName} validée.`, "success");
    });
  }

  function handleSendChanges(comment: string) {
    const m = modalTarget;
    if (!m || !m.planId) return;
    setModalPending(true);
    requestWeekChanges(m.planId, comment || undefined).then((result) => {
      setModalPending(false);
      setModalTarget(null);
      if (!result.ok) {
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      setOverrides((prev) => new Map(prev).set(m.employeeId, "needs_changes"));
      toast(`Modification demandée à ${m.firstName}.`, "success");
    });
  }

  const dates = presence.map((p) => p.date);
  const total = members.length;
  const receivedCount = members.filter((m) => statusOf(m) !== "draft" && statusOf(m) !== "not_submitted").length;
  const toValidateCount = members.filter((m) => statusOf(m) === "submitted").length;
  const validatedCount = members.filter((m) => statusOf(m) === "validated").length;
  const visibleMembers = members.filter((m) => matchesFilter(statusOf(m), filter));

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm font-medium text-slate-700">
          {total} collaborateur{total > 1 ? "s" : ""} · {receivedCount} demande{receivedCount > 1 ? "s" : ""} reçue{receivedCount > 1 ? "s" : ""} ·{" "}
          {toValidateCount} à valider · {validatedCount} validée{validatedCount > 1 ? "s" : ""}
        </p>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          {presence.map((p, idx) => (
            <div key={p.date}>
              <p className="text-[11px] font-medium text-slate-400">{WEEKDAY_LABELS[idx]}</p>
              <p className={`text-sm font-semibold ${p.belowThreshold ? "text-amber-600" : "text-slate-800"}`}>
                {p.officePercent}% {p.belowThreshold && "⚠️"}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400" title="Inclut les demandes en attente de validation.">
          Présence prévisionnelle au bureau
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <span>{l.icon}</span> {l.label}
          </span>
        ))}
      </div>

      {/* Desktop : tableau planning consolidé. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 sm:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 text-left">Collaborateur</th>
              {WEEKDAY_LABELS.map((label, idx) => (
                <th key={label} className="px-2 py-2 text-center">
                  {label} {formatDayNumber(dates[idx] ?? "")}
                </th>
              ))}
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleMembers.map((m) => {
              const status = statusOf(m);
              const pending = pendingRows.has(m.employeeId);
              return (
                <tr key={m.employeeId}>
                  <td className="px-4 py-2.5 align-middle">
                    <button type="button" className="text-left" onClick={() => setDrawerTarget(m)}>
                      <span className="text-sm font-medium text-slate-900 underline decoration-slate-200 underline-offset-2 hover:decoration-slate-400">
                        {m.firstName} {m.lastName}
                      </span>
                    </button>
                  </td>
                  {m.days.map((d) => (
                    <td key={d.date} className="p-1 align-middle">
                      <div className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-center ${cellTone(d.kind, status)}`}>
                        <span className="text-sm leading-none">{d.icon}</span>
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2.5 align-middle">
                    {status === "not_submitted" ? <span className="badge bg-slate-100 text-slate-500">Brouillon</span> : <StatusBadge status={status} />}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    {status === "submitted" && m.planId && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          disabled={pending}
                          onClick={() => handleValidate(m)}
                        >
                          ✓ Valider
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          disabled={pending}
                          onClick={() => setModalTarget(m)}
                        >
                          ↩ Modification
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleMembers.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun collaborateur.</p>}
      </div>

      {/* Mobile : une carte compacte par collaborateur, jamais le tableau compressé. */}
      <div className="space-y-3 sm:hidden">
        {visibleMembers.map((m) => {
          const status = statusOf(m);
          const pending = pendingRows.has(m.employeeId);
          return (
            <div key={m.employeeId} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="text-left text-sm font-semibold text-slate-900" onClick={() => setDrawerTarget(m)}>
                  {m.firstName} {m.lastName}
                </button>
                {status === "not_submitted" ? <span className="badge bg-slate-100 text-slate-500">Brouillon</span> : <StatusBadge status={status} />}
              </div>
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {m.days.map((d, idx) => (
                  <div key={d.date} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-500">
                      {WEEKDAY_LABELS[idx]} {formatDayNumber(d.date)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <span>{d.icon}</span> {d.label}
                    </span>
                  </div>
                ))}
              </div>
              {status === "submitted" && m.planId && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => handleValidate(m)}
                  >
                    ✓ Valider
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => setModalTarget(m)}
                  >
                    ↩ Modifier
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {visibleMembers.length === 0 && <p className="card text-center text-sm text-slate-400">Aucun collaborateur.</p>}
      </div>

      {modalTarget && (
        <RequestChangesModal
          employeeName={`${modalTarget.firstName} ${modalTarget.lastName}`}
          pending={modalPending}
          onCancel={() => setModalTarget(null)}
          onSend={handleSendChanges}
        />
      )}

      {drawerTarget && <EmployeeDrawer data={toDrawerData(drawerTarget)} onClose={() => setDrawerTarget(null)} />}
    </div>
  );
}
