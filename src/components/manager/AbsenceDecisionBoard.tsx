"use client";

import { useState } from "react";
import {
  decideAbsence,
  decideAbsenceReopenRequest,
  managerCancelAbsence,
  managerRequestAbsenceChanges,
  managerValidateAbsenceNow,
  updateAbsence,
} from "@/lib/actions/absences";
import { toast } from "@/lib/toast";
import { AbsenceStatusBadge } from "@/components/AbsenceStatusBadge";
import { KebabMenu } from "@/components/KebabMenu";
import { RequestChangesModal } from "@/components/manager/RequestChangesModal";
import { AbsenceHistoryButton } from "@/components/employee/AbsenceHistoryButton";
import type { AbsenceRequestKind, AbsenceStatus } from "@/lib/supabase/database.types";

export interface AbsenceBoardItem {
  id: string;
  employeeId: string;
  employeeName: string;
  absenceTypeId: string;
  typeName: string | null;
  startDate: string;
  endDate: string;
  comment: string | null;
  status: AbsenceStatus;
  managerComment: string | null;
  pendingRequest: { id: string; kind: AbsenceRequestKind; reason: string | null } | null;
}

export interface AbsenceTypeOption {
  id: string;
  name: string;
}

function formatRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}

/** Libellé de statut, y compris les états de demande de réouverture propres à ce tableau. */
function StatusCell({ item }: { item: AbsenceBoardItem }) {
  if (item.status === "validated" && item.pendingRequest) {
    return (
      <span className="badge bg-amber-50 text-amber-700" title={item.pendingRequest.reason ?? undefined}>
        {item.pendingRequest.kind === "cancellation" ? "Annulation demandée" : "Modification demandée"}
      </span>
    );
  }
  return <AbsenceStatusBadge status={item.status} />;
}

function DecisionActions({
  item,
  pending,
  onValidate,
  onRequestChanges,
  onEdit,
  onCancel,
  onAuthorize,
  onRefuse,
}: {
  item: AbsenceBoardItem;
  pending: boolean;
  onValidate: () => void;
  onRequestChanges: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onAuthorize: () => void;
  onRefuse: () => void;
}) {
  if (item.status === "validated" && item.pendingRequest) {
    const isCancellation = item.pendingRequest.kind === "cancellation";
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          disabled={pending}
          onClick={onAuthorize}
        >
          {isCancellation ? "Accepter l'annulation" : "Autoriser la modification"}
        </button>
        <KebabMenu items={[{ label: "Refuser", onClick: onRefuse, tone: "danger" }]} />
      </div>
    );
  }

  if (item.status === "submitted") {
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
        <KebabMenu items={[{ label: "↩ Demander une modification", onClick: onRequestChanges }]} />
      </div>
    );
  }

  if (item.status === "validated") {
    return (
      <KebabMenu
        items={[
          { label: "Modifier l'absence", onClick: onEdit },
          { label: "Demander au collaborateur de modifier", onClick: onRequestChanges },
          { label: "Annuler l'absence", onClick: onCancel, tone: "danger" },
        ]}
      />
    );
  }

  if (item.status === "cancelled") return null;

  // draft / needs_changes : le collaborateur a la main, le manager peut toujours intervenir directement.
  return <KebabMenu items={[{ label: "Modifier", onClick: onEdit }]} />;
}

function AbsenceEditForm({
  item,
  types,
  pending,
  onCancel,
  onSave,
}: {
  item: AbsenceBoardItem;
  types: AbsenceTypeOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (values: { absenceTypeId: string; startDate: string; endDate: string; comment: string }) => void;
}) {
  const [absenceTypeId, setAbsenceTypeId] = useState(item.absenceTypeId);
  const [startDate, setStartDate] = useState(item.startDate);
  const [endDate, setEndDate] = useState(item.endDate);
  const [comment, setComment] = useState(item.comment ?? "");

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-brand-50/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select className="input" value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div />
        <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <input className="input" placeholder="Commentaire" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button type="button" className="text-xs text-slate-500 underline" onClick={onCancel} disabled={pending}>
          Fermer
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          disabled={pending}
          onClick={() => onSave({ absenceTypeId, startDate, endDate, comment })}
        >
          {pending ? "Enregistrement..." : "Enregistrer et valider"}
        </button>
      </div>
    </div>
  );
}

/** Confirmation d'annulation directe (section 14) — jamais un `window.confirm` générique, un motif facultatif reste utile ici. */
function CancelAbsenceModal({
  employeeName,
  pending,
  onCancel,
  onConfirm,
}: {
  employeeName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">Annuler l&apos;absence de {employeeName} ?</h2>
        <label className="label mt-4">Motif (facultatif)</label>
        <textarea className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Retour
          </button>
          <button type="button" className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => onConfirm(comment.trim())}>
            {pending ? "Annulation..." : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Décision consolidée des absences d'une équipe (section 23 du cahier des
 * charges "workflow congés") : un seul composant réutilisé identique pour
 * Squad Lead / Tribe Lead / Responsable DU / Admin — seul le périmètre des
 * lignes reçues change selon l'appelant, même principe que
 * `TeamPlanningBoard` pour le planning télétravail.
 */
export function AbsenceDecisionBoard({ items, types }: { items: AbsenceBoardItem[]; types: AbsenceTypeOption[] }) {
  const [overrides, setOverrides] = useState<Map<string, Partial<AbsenceBoardItem>>>(new Map());
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [requestChangesTarget, setRequestChangesTarget] = useState<AbsenceBoardItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AbsenceBoardItem | null>(null);
  const [modalPending, setModalPending] = useState(false);

  function itemWithOverride(item: AbsenceBoardItem): AbsenceBoardItem {
    return { ...item, ...overrides.get(item.id) };
  }

  function setRowPending(id: string, val: boolean) {
    setPendingRows((prev) => {
      const next = new Set(prev);
      if (val) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function patch(id: string, values: Partial<AbsenceBoardItem>) {
    setOverrides((prev) => new Map(prev).set(id, { ...prev.get(id), ...values }));
  }

  function handleValidate(item: AbsenceBoardItem) {
    const previous = itemWithOverride(item).status;
    patch(item.id, { status: "validated" });
    setRowPending(item.id, true);
    decideAbsence(item.id, "validated").then((result) => {
      setRowPending(item.id, false);
      if (!result.ok) {
        patch(item.id, { status: previous });
        toast(result.error ?? "Validation impossible.", "error");
        return;
      }
      toast(`Absence de ${item.employeeName} validée.`, "success");
    });
  }

  // Deux chemins distincts arrivent tous deux à "à modifier", mais depuis un
  // statut de départ différent : `decide_absence` ne traite qu'une absence
  // SOUMISE (sections 2-3), `manager_request_absence_changes` une absence
  // déjà VALIDÉE, de l'initiative du manager (section 15).
  function handleRequestChanges(item: AbsenceBoardItem, comment: string) {
    const previous = itemWithOverride(item).status;
    patch(item.id, { status: "needs_changes" });
    setModalPending(true);
    const action = previous === "submitted" ? decideAbsence(item.id, "changes_requested", comment || undefined) : managerRequestAbsenceChanges(item.id, comment || undefined);
    action.then((result) => {
      setModalPending(false);
      setRequestChangesTarget(null);
      if (!result.ok) {
        patch(item.id, { status: previous });
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      toast(`Modification demandée à ${item.employeeName}.`, "success");
    });
  }

  function handleAuthorize(item: AbsenceBoardItem) {
    const request = itemWithOverride(item).pendingRequest;
    if (!request) return;
    const previousStatus = itemWithOverride(item).status;
    const isCancellation = request.kind === "cancellation";
    patch(item.id, { status: isCancellation ? "cancelled" : "needs_changes", pendingRequest: null });
    setRowPending(item.id, true);
    decideAbsenceReopenRequest(request.id, true).then((result) => {
      setRowPending(item.id, false);
      if (!result.ok) {
        patch(item.id, { status: previousStatus, pendingRequest: request });
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      toast(isCancellation ? `Absence de ${item.employeeName} annulée.` : `${item.employeeName} peut à nouveau modifier son absence.`, "success");
    });
  }

  function handleRefuse(item: AbsenceBoardItem) {
    const request = itemWithOverride(item).pendingRequest;
    if (!request) return;
    patch(item.id, { pendingRequest: null });
    setRowPending(item.id, true);
    decideAbsenceReopenRequest(request.id, false).then((result) => {
      setRowPending(item.id, false);
      if (!result.ok) {
        patch(item.id, { pendingRequest: request });
        toast(result.error ?? "Action impossible.", "error");
        return;
      }
      toast(`Demande refusée pour ${item.employeeName}.`, "success");
    });
  }

  function handleCancel(item: AbsenceBoardItem, comment: string) {
    const previous = itemWithOverride(item).status;
    patch(item.id, { status: "cancelled" });
    setModalPending(true);
    managerCancelAbsence(item.id, comment || undefined).then((result) => {
      setModalPending(false);
      setCancelTarget(null);
      if (!result.ok) {
        patch(item.id, { status: previous });
        toast(result.error ?? "Annulation impossible.", "error");
        return;
      }
      toast(`Absence de ${item.employeeName} annulée.`, "success");
    });
  }

  function handleSaveAndValidate(item: AbsenceBoardItem, values: { absenceTypeId: string; startDate: string; endDate: string; comment: string }) {
    setRowPending(item.id, true);
    updateAbsence({ id: item.id, absenceTypeId: values.absenceTypeId, startDate: values.startDate, endDate: values.endDate, comment: values.comment || null })
      .then((updateResult) => {
        if (!updateResult.ok) {
          setRowPending(item.id, false);
          toast(updateResult.error ?? "Modification impossible.", "error");
          return;
        }
        return managerValidateAbsenceNow(item.id).then((validateResult) => {
          setRowPending(item.id, false);
          if (!validateResult.ok) {
            toast(validateResult.error ?? "Validation impossible.", "error");
            return;
          }
          patch(item.id, {
            status: "validated",
            absenceTypeId: values.absenceTypeId,
            typeName: types.find((t) => t.id === values.absenceTypeId)?.name ?? item.typeName,
            startDate: values.startDate,
            endDate: values.endDate,
            comment: values.comment || null,
            pendingRequest: null,
          });
          setEditingId(null);
          toast(`Absence de ${item.employeeName} modifiée et validée.`, "success");
        });
      });
  }

  const visible = items.map(itemWithOverride);
  const toValidateCount = visible.filter((i) => i.status === "submitted").length;
  const reopenCount = visible.filter((i) => i.pendingRequest?.kind === "modification").length;
  const cancelCount = visible.filter((i) => i.pendingRequest?.kind === "cancellation").length;

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm font-medium text-slate-700">
          {toValidateCount} à valider · {reopenCount} modification{reopenCount > 1 ? "s" : ""} demandée{reopenCount > 1 ? "s" : ""} · {cancelCount}{" "}
          annulation{cancelCount > 1 ? "s" : ""} demandée{cancelCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 sm:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 text-left">Collaborateur</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Dates</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Décision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((item) => {
              const pending = pendingRows.has(item.id);
              const isEditing = editingId === item.id;
              return (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 align-middle text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{item.employeeName}</span>
                      <AbsenceHistoryButton absenceId={item.id} compact />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-sm text-slate-600">{item.typeName ?? "—"}</td>
                  <td className="px-3 py-2.5 align-middle text-sm text-slate-600">{formatRange(item.startDate, item.endDate)}</td>
                  <td className="px-3 py-2.5 align-middle" colSpan={isEditing ? 2 : 1}>
                    <StatusCell item={item} />
                    {isEditing && (
                      <AbsenceEditForm
                        item={item}
                        types={types}
                        pending={pending}
                        onCancel={() => setEditingId(null)}
                        onSave={(values) => handleSaveAndValidate(item, values)}
                      />
                    )}
                  </td>
                  {!isEditing && (
                    <td className="px-3 py-2.5 align-middle">
                      <DecisionActions
                        item={item}
                        pending={pending}
                        onValidate={() => handleValidate(item)}
                        onRequestChanges={() => setRequestChangesTarget(item)}
                        onEdit={() => setEditingId(item.id)}
                        onCancel={() => setCancelTarget(item)}
                        onAuthorize={() => handleAuthorize(item)}
                        onRefuse={() => handleRefuse(item)}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune absence.</p>}
      </div>

      {/* Mobile */}
      <div className="space-y-3 sm:hidden">
        {visible.map((item) => {
          const pending = pendingRows.has(item.id);
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.employeeName}</p>
                  <AbsenceHistoryButton absenceId={item.id} compact />
                </div>
                <StatusCell item={item} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.typeName ?? "—"} · {formatRange(item.startDate, item.endDate)}
              </p>
              {isEditing ? (
                <AbsenceEditForm
                  item={item}
                  types={types}
                  pending={pending}
                  onCancel={() => setEditingId(null)}
                  onSave={(values) => handleSaveAndValidate(item, values)}
                />
              ) : (
                <div className="mt-3">
                  <DecisionActions
                    item={item}
                    pending={pending}
                    onValidate={() => handleValidate(item)}
                    onRequestChanges={() => setRequestChangesTarget(item)}
                    onEdit={() => setEditingId(item.id)}
                    onCancel={() => setCancelTarget(item)}
                    onAuthorize={() => handleAuthorize(item)}
                    onRefuse={() => handleRefuse(item)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <p className="card text-center text-sm text-slate-400">Aucune absence.</p>}
      </div>

      {requestChangesTarget && (
        <RequestChangesModal
          employeeName={requestChangesTarget.employeeName}
          pending={modalPending}
          onCancel={() => setRequestChangesTarget(null)}
          onSend={(comment) => handleRequestChanges(requestChangesTarget, comment)}
        />
      )}

      {cancelTarget && (
        <CancelAbsenceModal
          employeeName={cancelTarget.employeeName}
          pending={modalPending}
          onCancel={() => setCancelTarget(null)}
          onConfirm={(comment) => handleCancel(cancelTarget, comment)}
        />
      )}
    </div>
  );
}
