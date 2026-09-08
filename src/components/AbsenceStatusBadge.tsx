import type { AbsenceStatus } from "@/lib/supabase/database.types";

const ABSENCE_STATUS_STYLES: Record<AbsenceStatus, { label: string; className: string; icon: string }> = {
  draft: { label: "Brouillon", className: "bg-slate-100 text-slate-600", icon: "⚪" },
  submitted: { label: "En attente de validation", className: "bg-amber-50 text-amber-700", icon: "🟠" },
  validated: { label: "Validée", className: "bg-emerald-50 text-emerald-700", icon: "🟢" },
  needs_changes: { label: "À modifier", className: "bg-amber-50 text-amber-700", icon: "🟠" },
  cancelled: { label: "Annulée", className: "bg-slate-100 text-slate-500", icon: "⊘" },
};

/**
 * Libellé "EN ATTENTE DE VALIDATION" (et non un simple "En attente") demandé
 * explicitement pour les absences — immédiatement compréhensible côté
 * collaborateur, distinct du vocabulaire compact utilisé pour le télétravail.
 */
export function AbsenceStatusBadge({ status }: { status: AbsenceStatus }) {
  const s = ABSENCE_STATUS_STYLES[status];
  return (
    <span className={`badge ${s.className}`}>
      <span>{s.icon}</span> {s.label}
    </span>
  );
}
