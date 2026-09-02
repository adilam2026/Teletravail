import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Seules les actions majeures du cycle de validation d'une semaine ont leur
// place ici (section "Suivi de vos demandes et décisions") — le reste
// (édition de compte, absences...) relève d'autres écrans dédiés.
const ACTION_LABELS: Record<string, string> = {
  week_submitted: "Semaine soumise",
  week_recalled: "Semaine rappelée",
  week_validated: "Semaine validée",
  week_rejected: "Semaine refusée",
  week_needs_changes: "Modification demandée",
  week_reopen_requested: "Réouverture demandée",
  week_reopen_approved: "Réouverture acceptée",
};

export default async function EmployeeHistoryPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .in("action", Object.keys(ACTION_LABELS))
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="text-sm text-slate-500">Suivi de vos demandes et décisions</p>
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(logs ?? []).map((log) => (
          <div key={log.id} className="px-5 py-3">
            <p className="text-sm font-medium text-slate-800">{ACTION_LABELS[log.action] ?? log.action}</p>
            <p className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString("fr-FR")}</p>
          </div>
        ))}
        {(logs ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun événement.</p>}
      </div>
    </div>
  );
}
