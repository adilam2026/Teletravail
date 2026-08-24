import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Journalise une action métier (section 34 du cahier des charges). Utilise
 * le client "utilisateur courant" : la policy audit_logs_insert exige
 * actor_id = auth.uid(), donc l'entrée est toujours attribuée à l'auteur
 * réel de l'action, y compris quand un admin agit pour un tiers.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
}
