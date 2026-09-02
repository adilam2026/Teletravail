import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABELS: Record<string, string> = {
  week_submitted: "Semaine soumise",
  week_recalled: "Semaine rappelée",
  week_validated: "Semaine validée",
  week_rejected: "Semaine refusée",
  week_needs_changes: "Modification demandée",
  week_reopen_requested: "Réouverture demandée",
  week_reopen_approved: "Réouverture acceptée",
  user_created: "Compte créé",
  user_updated: "Compte modifié",
  squad_changed: "Rattachement (Squad) modifié",
  user_deactivated: "Compte désactivé",
  user_reactivated: "Compte réactivé",
  password_reset: "Mot de passe réinitialisé",
  password_changed: "Mot de passe modifié",
  absence_created: "Absence enregistrée",
  absence_deleted: "Absence supprimée",
  absence_type_updated: "Type d'absence modifié",
  holiday_created: "Jour férié créé",
  holiday_updated: "Jour férié modifié",
  holiday_deleted: "Jour férié supprimé",
  exception_created: "Exception créée",
  exception_deleted: "Exception supprimée",
  rule_updated: "Règle modifiée",
  setting_updated: "Paramètre modifié",
  team_created: "Équipe créée",
  team_updated: "Équipe modifiée",
  quota_override_changed: "Quota individuel modifié",
};

export default async function AdminHistoryPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const { data: logs } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => !!id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", actorIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const actorById = new Map((actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="text-sm text-slate-500">Journal d&apos;audit complet</p>
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {(logs ?? []).map((log) => (
          <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{ACTION_LABELS[log.action] ?? log.action}</p>
              <p className="text-xs text-slate-400">
                {log.actor_id ? actorById.get(log.actor_id) ?? "Utilisateur" : "Système"} · {log.entity_type}
              </p>
            </div>
            <p className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString("fr-FR")}</p>
          </div>
        ))}
        {(logs ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun événement.</p>}
      </div>
    </div>
  );
}
