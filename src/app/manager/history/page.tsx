import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABELS: Record<string, string> = {
  week_submitted: "Semaine soumise",
  week_validated: "Semaine validée",
  week_rejected: "Semaine refusée",
  week_needs_changes: "Modification demandée",
  week_reopen_requested: "Réouverture demandée",
  week_reopen_approved: "Réouverture acceptée",
  user_created: "Compte créé",
  user_updated: "Compte modifié",
  user_deactivated: "Compte désactivé",
  user_reactivated: "Compte réactivé",
  password_reset: "Mot de passe réinitialisé",
  absence_created: "Absence enregistrée",
};

export default async function ManagerHistoryPage() {
  await requireRole("manager");
  const supabase = await createClient();

  const { data: logs } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(150);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="text-sm text-slate-500">Actions concernant votre équipe</p>
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
