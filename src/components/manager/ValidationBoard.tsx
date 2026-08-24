"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectWeek, requestWeekChanges, validateWeek, validateWeeksInBulk } from "@/lib/actions/weeks";
import { ComplianceBadge } from "@/components/StatusBadge";
import type { WeekCompliance } from "@/lib/rules-engine";

export interface ValidationRowData {
  planId: string;
  employeeName: string;
  weekStart: string;
  selectedCount: number;
  quota: number;
  compliance: WeekCompliance;
  alertMessages: string[];
}

export function ValidationBoard({ rows }: { rows: ValidationRowData[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [commentFor, setCommentFor] = useState<{ planId: string; mode: "reject" | "changes" } | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const compliantRows = rows.filter((r) => r.compliance !== "non_compliant");

  function toggle(planId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(planId) ? next.delete(planId) : next.add(planId);
      return next;
    });
  }

  function handleBulkValidate() {
    setError(null);
    startTransition(async () => {
      const result = await validateWeeksInBulk([...selected]);
      if (!result.ok) setError(result.error ?? "Erreur");
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleValidateAllCompliant() {
    setError(null);
    startTransition(async () => {
      const result = await validateWeeksInBulk(compliantRows.map((r) => r.planId));
      if (!result.ok) setError(result.error ?? "Erreur");
      router.refresh();
    });
  }

  function handleValidate(planId: string) {
    setError(null);
    startTransition(async () => {
      const result = await validateWeek(planId);
      if (!result.ok) setError(result.error ?? "Erreur");
      router.refresh();
    });
  }

  function submitComment() {
    if (!commentFor || !comment.trim()) return;
    setError(null);
    startTransition(async () => {
      const action = commentFor.mode === "reject" ? rejectWeek : requestWeekChanges;
      const result = await action(commentFor.planId, comment.trim());
      if (!result.ok) setError(result.error ?? "Erreur");
      setCommentFor(null);
      setComment("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={selected.size === 0 || pending} onClick={handleBulkValidate}>
            Valider la sélection ({selected.size})
          </button>
          <button type="button" className="btn-secondary" disabled={compliantRows.length === 0 || pending} onClick={handleValidateAllCompliant}>
            Valider toutes les semaines conformes ({compliantRows.length})
          </button>
        </div>
      )}

      <div className="card divide-y divide-slate-100 p-0">
        {rows.map((row) => (
          <div key={row.planId} className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(row.planId)}
                  onChange={() => toggle(row.planId)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">{row.employeeName}</p>
                  <p className="text-xs text-slate-400">
                    Semaine du {row.weekStart} · {row.selectedCount}/{row.quota} j. télétravail
                  </p>
                </div>
              </div>
              <ComplianceBadge compliance={row.compliance} />
            </div>

            {row.alertMessages.length > 0 && (
              <div className="space-y-1 pl-7">
                {row.alertMessages.map((m, idx) => (
                  <p key={idx} className="text-xs text-amber-700">
                    ⚠️ {m}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pl-7">
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={() => handleValidate(row.planId)}>
                Valider
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                disabled={pending}
                onClick={() => setCommentFor({ planId: row.planId, mode: "changes" })}
              >
                Demander une modification
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
                disabled={pending}
                onClick={() => setCommentFor({ planId: row.planId, mode: "reject" })}
              >
                Refuser
              </button>
            </div>

            {commentFor?.planId === row.planId && (
              <div className="ml-7 space-y-2 rounded-xl bg-slate-50 p-3">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Commentaire (obligatoire)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setCommentFor(null)}>
                    Annuler
                  </button>
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!comment.trim() || pending} onClick={submitComment}>
                    Envoyer
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucune semaine en attente de validation.</p>}
      </div>
    </div>
  );
}
