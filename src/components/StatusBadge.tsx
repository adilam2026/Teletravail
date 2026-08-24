import type { PlanStatus } from "@/lib/supabase/database.types";
import type { WeekCompliance } from "@/lib/rules-engine";

const STATUS_STYLES: Record<PlanStatus, { label: string; className: string; icon: string }> = {
  draft: { label: "Brouillon", className: "bg-slate-100 text-slate-600", icon: "⚪" },
  submitted: { label: "En attente de validation", className: "bg-amber-50 text-amber-700", icon: "🟠" },
  validated: { label: "Validée", className: "bg-emerald-50 text-emerald-700", icon: "🟢" },
  rejected: { label: "Refusée", className: "bg-rose-50 text-rose-700", icon: "🔴" },
  needs_changes: { label: "À modifier", className: "bg-amber-50 text-amber-700", icon: "🟠" },
};

export function StatusBadge({ status }: { status: PlanStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`badge ${s.className}`}>
      <span>{s.icon}</span> {s.label}
    </span>
  );
}

const COMPLIANCE_STYLES: Record<WeekCompliance, { label: string; className: string; icon: string }> = {
  compliant: { label: "Conforme", className: "bg-emerald-50 text-emerald-700", icon: "🟢" },
  warning: { label: "Attention", className: "bg-amber-50 text-amber-700", icon: "🟠" },
  non_compliant: { label: "Non conforme", className: "bg-rose-50 text-rose-700", icon: "🔴" },
};

export function ComplianceBadge({ compliance }: { compliance: WeekCompliance }) {
  const s = COMPLIANCE_STYLES[compliance];
  return (
    <span className={`badge ${s.className}`}>
      <span>{s.icon}</span> {s.label}
    </span>
  );
}
