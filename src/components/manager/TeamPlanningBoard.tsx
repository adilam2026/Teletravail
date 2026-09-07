"use client";

import { useEffect, useRef, useState } from "react";
import { WEEKDAY_LABELS } from "@/lib/rules-engine/calendar";
import {
  validateWeek,
  requestWeekChanges,
  getEditableWeek,
  managerValidateNow,
  decideReopenRequest,
  type EditableWeekResult,
} from "@/lib/actions/weeks";
import { useWeekEditor } from "@/components/calendar/useWeekEditor";
import { toast } from "@/lib/toast";
import { StatusBadge } from "@/components/StatusBadge";
import type { PlanStatus, AppRole } from "@/lib/supabase/database.types";
import type { TeamPresenceDay, DayEvaluation } from "@/lib/rules-engine/types";
import type { GroupDayKind, PendingReopenRequest } from "@/lib/data/hierarchy";
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
  /** Demande de réouverture en attente sur cette semaine (section "réouverture"), le cas échéant. */
  pendingReopenRequest: PendingReopenRequest | null;
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

function dayLabel(dates: string[], date: string): string {
  const idx = dates.indexOf(date);
  return idx >= 0 ? WEEKDAY_LABELS[idx]! : date;
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
 * Petit menu "⋯" pour les actions secondaires (section 12-13 du cahier des
 * charges "Décision") : jamais plus d'un bouton principal visible par ligne —
 * le reste reste accessible sans jamais accumuler de boutons, essentiel pour
 * qu'un planning de 15-20 collaborateurs reste lisible.
 */
function KebabMenu({ items }: { items: { label: string; onClick: () => void; tone?: "default" | "danger" }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-400 hover:bg-slate-100"
        aria-label="Plus d'actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-slate-100 bg-white py-1 shadow-elevated">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs font-medium hover:bg-slate-50 ${
                item.tone === "danger" ? "text-rose-600" : "text-slate-700"
              }`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Libellé de statut, y compris l'état "réouverture demandée" propre à ce tableau (absent de `StatusBadge` générique). */
function StatusCell({ m, status }: { m: TeamPlanningMember; status: PlanStatus | "not_submitted" }) {
  if (status === "validated" && m.pendingReopenRequest) {
    return (
      <span className="badge bg-amber-50 text-amber-700" title={m.pendingReopenRequest.reason ?? undefined}>
        ↩ Modification demandée
      </span>
    );
  }
  if (status === "not_submitted") return <span className="badge bg-slate-100 text-slate-500">Brouillon</span>;
  return <StatusBadge status={status} />;
}

/**
 * Une action principale + le reste derrière "⋯", strictement selon le statut
 * (section 12-13) : Brouillon -> Modifier seul ; En attente -> Valider +
 * Demander modification ; Validée -> Modifier seul ; Validée avec demande de
 * réouverture -> Autoriser + Refuser ; À modifier -> Modifier seul.
 */
function DecisionActions({
  m,
  status,
  pending,
  onValidate,
  onRequestChanges,
  onEdit,
  onAuthorizeReopen,
  onRefuseReopen,
}: {
  m: TeamPlanningMember;
  status: PlanStatus | "not_submitted";
  pending: boolean;
  onValidate: () => void;
  onRequestChanges: () => void;
  onEdit: () => void;
  onAuthorizeReopen: () => void;
  onRefuseReopen: () => void;
}) {
  if (status === "validated" && m.pendingReopenRequest) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          disabled={pending}
          onClick={onAuthorizeReopen}
        >
          Autoriser la modification
        </button>
        <KebabMenu items={[{ label: "Refuser", onClick: onRefuseReopen, tone: "danger" }]} />
      </div>
    );
  }

  if (status === "submitted" && m.planId) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          disabled={pending}
          onClick={onValidate}
        >
          ✓ Valider
        </button>
        <KebabMenu items={[{ label: "↩ Demander modification", onClick: onRequestChanges }]} />
      </div>
    );
  }

  return <KebabMenu items={[{ label: "Modifier", onClick: onEdit }]} />;
}

/**
 * Charge à la demande (jamais préchargé pour chaque ligne, section perf) la
 * semaine éditable d'un collaborateur, quand le manager clique "Modifier".
 */
function useEditableWeek(employeeId: string, weekStart: string) {
  const [data, setData] = useState<EditableWeekResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getEditableWeek(employeeId, weekStart).then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId, weekStart]);

  return { data, error };
}

/**
 * Même moteur de sélection/optimistic UI que la saisie du collaborateur
 * (`useWeekEditor`, réutilisé tel quel — section "même principe que dans
 * Saisie télétravail du collaborateur") + "Enregistrer et valider" qui
 * bascule directement en validée, jamais via une resoumission (section 2).
 */
function useManagerWeekEditor(data: EditableWeekResult, member: TeamPlanningMember, weekStart: string, onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  const editor = useWeekEditor({
    weekStart,
    evaluationInput: data.evaluationInput,
    badges: data.badges,
    editable: true,
    targetEmployeeId: member.employeeId,
  });

  function handleValidate() {
    setSaving(true);
    managerValidateNow(data.planId, member.employeeId).then((res) => {
      setSaving(false);
      if (!res.ok) {
        toast(res.error ?? "Validation impossible.", "error");
        return;
      }
      toast(`Semaine de ${member.firstName} modifiée et validée.`, "success");
      onSaved();
    });
  }

  return { ...editor, saving, handleValidate };
}

function editableCellState(day: DayEvaluation, badge: { icon: string } | null | undefined) {
  if (day.selected) return { icon: "🏠", tone: "border-brand-300 bg-brand-50" };
  if (badge) return { icon: badge.icon, tone: "border-slate-200 bg-slate-50" };
  if (day.allowed) return { icon: "🏢", tone: "border-slate-200 bg-white" };
  return { icon: "🔒", tone: "border-slate-200 bg-slate-100" };
}

function EditableWeekRowLoaded({
  data,
  member,
  weekStart,
  onClose,
  onSaved,
}: {
  data: EditableWeekResult;
  member: TeamPlanningMember;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { result, dates, swapPrompt, toast: editorToast, handleClick, handleSwapChoice, cancelSwap, saving, handleValidate } = useManagerWeekEditor(
    data,
    member,
    weekStart,
    onSaved
  );

  return (
    <>
      <td className="px-4 py-2.5 align-middle">
        <span className="text-sm font-medium text-slate-900">
          {member.firstName} {member.lastName}
        </span>
        <p className="text-[11px] text-brand-600">Modification en cours…</p>
      </td>
      {result.days.map((day) => {
        const badge = data.badges[day.date];
        const clickable = (day.selected || day.allowed || (day.swapCandidates?.length ?? 0) > 0) && !badge;
        const cellState = editableCellState(day, badge);
        return (
          <td key={day.date} className="p-1 align-middle">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => handleClick(day)}
              title={!day.selected && !day.allowed && day.reason && !badge ? day.reason : undefined}
              className={`flex w-full flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center text-sm ${cellState.tone} ${
                clickable ? "cursor-pointer hover:border-brand-400" : "cursor-default"
              }`}
            >
              <span className="leading-none">{cellState.icon}</span>
            </button>
          </td>
        );
      })}
      <td className="px-3 py-2.5 align-middle" colSpan={2}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            disabled={saving}
            onClick={handleValidate}
          >
            {saving ? "Enregistrement..." : "Enregistrer et valider"}
          </button>
          <button type="button" className="text-xs text-slate-500 underline" onClick={onClose}>
            Fermer
          </button>
        </div>
        {swapPrompt && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-800">
            <span>Remplacer :</span>
            {swapPrompt.candidates.map((c) => (
              <button key={c} type="button" className="rounded bg-brand-50 px-1.5 py-0.5" onClick={() => handleSwapChoice(c)}>
                {dayLabel(dates, c)}
              </button>
            ))}
            <button type="button" className="underline" onClick={cancelSwap}>
              Annuler
            </button>
          </div>
        )}
        {editorToast && <p className="mt-1 text-[11px] text-rose-600">{editorToast}</p>}
      </td>
    </>
  );
}

function EditableWeekRowCells({
  member,
  weekStart,
  onClose,
  onSaved,
}: {
  member: TeamPlanningMember;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useEditableWeek(member.employeeId, weekStart);

  if (error) {
    return (
      <>
        <td colSpan={7} className="px-4 py-3 text-sm text-rose-600">
          {error}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <button type="button" className="text-xs text-slate-500 underline" onClick={onClose}>
            Fermer
          </button>
        </td>
      </>
    );
  }

  if (!data) {
    return (
      <td colSpan={8} className="px-4 py-3 text-sm text-slate-400">
        Chargement…
      </td>
    );
  }

  return <EditableWeekRowLoaded data={data} member={member} weekStart={weekStart} onClose={onClose} onSaved={onSaved} />;
}

function EditableWeekCardLoaded({
  data,
  member,
  weekStart,
  onClose,
  onSaved,
}: {
  data: EditableWeekResult;
  member: TeamPlanningMember;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { result, dates, swapPrompt, toast: editorToast, handleClick, handleSwapChoice, cancelSwap, saving, handleValidate } = useManagerWeekEditor(
    data,
    member,
    weekStart,
    onSaved
  );

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4">
      <p className="text-sm font-semibold text-slate-900">
        {member.firstName} {member.lastName}
      </p>
      <p className="text-[11px] text-brand-600">Modification en cours…</p>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {result.days.map((day, idx) => {
          const badge = data.badges[day.date];
          const clickable = (day.selected || day.allowed || (day.swapCandidates?.length ?? 0) > 0) && !badge;
          const cellState = editableCellState(day, badge);
          return (
            <button
              key={day.date}
              type="button"
              disabled={!clickable}
              onClick={() => handleClick(day)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center ${cellState.tone} ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="text-[10px] text-slate-400">{WEEKDAY_LABELS[idx]}</span>
              <span className="text-base leading-none">{cellState.icon}</span>
            </button>
          );
        })}
      </div>
      {swapPrompt && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-brand-800">
          <span>Remplacer :</span>
          {swapPrompt.candidates.map((c) => (
            <button key={c} type="button" className="rounded bg-brand-50 px-2 py-1" onClick={() => handleSwapChoice(c)}>
              {dayLabel(dates, c)}
            </button>
          ))}
          <button type="button" className="underline" onClick={cancelSwap}>
            Annuler
          </button>
        </div>
      )}
      {editorToast && <p className="mt-2 text-xs text-rose-600">{editorToast}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-50"
          disabled={saving}
          onClick={handleValidate}
        >
          {saving ? "Enregistrement..." : "Enregistrer et valider"}
        </button>
        <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function EditableWeekCard({
  member,
  weekStart,
  onClose,
  onSaved,
}: {
  member: TeamPlanningMember;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useEditableWeek(member.employeeId, weekStart);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
        <button type="button" className="mt-2 block text-xs underline" onClick={onClose}>
          Fermer
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-2xl border border-slate-100 p-4 text-sm text-slate-400">Chargement…</div>;
  }

  return <EditableWeekCardLoaded data={data} member={member} weekStart={weekStart} onClose={onClose} onSaved={onSaved} />;
}

/**
 * Planning consolidé de l'équipe avec validation directe (section 6-14 du
 * cahier des charges "vue manager") : capitalise sur le langage visuel de
 * `PlanningCalendar` (blocs de couleur plats, pas de tableau Excel) mais
 * avec les collaborateurs en lignes plutôt que les semaines — un seul
 * composant, réutilisé identique pour Squad Lead / Tribe Lead / Responsable
 * DU (section 21), seul le périmètre de `members` change selon l'appelant.
 * Validation optimiste (section 25) : aucun `router.refresh()` après une
 * décision, l'état local fait foi immédiatement, la mutation part en
 * arrière-plan. La colonne "Décision" (section 12-13) n'affiche jamais plus
 * d'une action principale par ligne — le reste (régularisation, réouverture)
 * reste accessible derrière "⋯" pour rester lisible avec 15-20 collaborateurs.
 */
export function TeamPlanningBoard({ members, presence }: { members: TeamPlanningMember[]; presence: TeamPresenceDay[] }) {
  const [overrides, setOverrides] = useState<Map<string, PlanStatus | "not_submitted">>(new Map());
  const [reopenOverrides, setReopenOverrides] = useState<Map<string, PendingReopenRequest | null>>(new Map());
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [modalTarget, setModalTarget] = useState<TeamPlanningMember | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<TeamPlanningMember | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function statusOf(m: TeamPlanningMember): PlanStatus | "not_submitted" {
    return overrides.get(m.employeeId) ?? m.status;
  }

  function reopenRequestOf(m: TeamPlanningMember): PendingReopenRequest | null {
    return reopenOverrides.has(m.employeeId) ? reopenOverrides.get(m.employeeId)! : m.pendingReopenRequest;
  }

  function memberWithLiveState(m: TeamPlanningMember): TeamPlanningMember {
    return { ...m, pendingReopenRequest: reopenRequestOf(m) };
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

  function handleAuthorizeReopen(m: TeamPlanningMember) {
    const request = reopenRequestOf(m);
    if (!request) return;
    const previousStatus = statusOf(m);
    setOverrides((prev) => new Map(prev).set(m.employeeId, "needs_changes"));
    setReopenOverrides((prev) => new Map(prev).set(m.employeeId, null));
    setRowPending(m.employeeId, true);
    decideReopenRequest(request.id, true).then((result) => {
      setRowPending(m.employeeId, false);
      if (!result.ok) {
        setOverrides((prev) => new Map(prev).set(m.employeeId, previousStatus));
        setReopenOverrides((prev) => new Map(prev).set(m.employeeId, request));
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      toast(`${m.firstName} peut à nouveau modifier sa semaine.`, "success");
    });
  }

  function handleRefuseReopen(m: TeamPlanningMember) {
    const request = reopenRequestOf(m);
    if (!request) return;
    setReopenOverrides((prev) => new Map(prev).set(m.employeeId, null));
    setRowPending(m.employeeId, true);
    decideReopenRequest(request.id, false).then((result) => {
      setRowPending(m.employeeId, false);
      if (!result.ok) {
        setReopenOverrides((prev) => new Map(prev).set(m.employeeId, request));
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      toast(`Demande de modification refusée pour ${m.firstName}.`, "success");
    });
  }

  function handleSaved(m: TeamPlanningMember) {
    setEditingId(null);
    setOverrides((prev) => new Map(prev).set(m.employeeId, "validated"));
  }

  const dates = presence.map((p) => p.date);
  const weekStart = dates[0] ?? "";
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
              <th className="px-3 py-2 text-left">Décision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleMembers.map((rawMember) => {
              const m = memberWithLiveState(rawMember);
              const status = statusOf(m);
              const pending = pendingRows.has(m.employeeId);
              const isEditing = editingId === m.employeeId;

              if (isEditing) {
                return (
                  <tr key={m.employeeId} className="bg-brand-50/20">
                    <EditableWeekRowCells member={m} weekStart={weekStart} onClose={() => setEditingId(null)} onSaved={() => handleSaved(m)} />
                  </tr>
                );
              }

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
                    <StatusCell m={m} status={status} />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <DecisionActions
                      m={m}
                      status={status}
                      pending={pending}
                      onValidate={() => handleValidate(m)}
                      onRequestChanges={() => setModalTarget(m)}
                      onEdit={() => setEditingId(m.employeeId)}
                      onAuthorizeReopen={() => handleAuthorizeReopen(m)}
                      onRefuseReopen={() => handleRefuseReopen(m)}
                    />
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
        {visibleMembers.map((rawMember) => {
          const m = memberWithLiveState(rawMember);
          const status = statusOf(m);
          const pending = pendingRows.has(m.employeeId);
          const isEditing = editingId === m.employeeId;

          if (isEditing) {
            return (
              <EditableWeekCard
                key={m.employeeId}
                member={m}
                weekStart={weekStart}
                onClose={() => setEditingId(null)}
                onSaved={() => handleSaved(m)}
              />
            );
          }

          return (
            <div key={m.employeeId} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="text-left text-sm font-semibold text-slate-900" onClick={() => setDrawerTarget(m)}>
                  {m.firstName} {m.lastName}
                </button>
                <StatusCell m={m} status={status} />
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
              <div className="mt-3">
                <DecisionActions
                  m={m}
                  status={status}
                  pending={pending}
                  onValidate={() => handleValidate(m)}
                  onRequestChanges={() => setModalTarget(m)}
                  onEdit={() => setEditingId(m.employeeId)}
                  onAuthorizeReopen={() => handleAuthorizeReopen(m)}
                  onRefuseReopen={() => handleRefuseReopen(m)}
                />
              </div>
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
