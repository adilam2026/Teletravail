import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  /**
   * Id de l'acteur, quand l'appelant l'a déjà sous la main (issu de
   * `requireUser()` un peu plus haut) : évite un `getUser()` réseau
   * redondant rien que pour journaliser (section 29 du cahier des charges
   * perf — chaque appel sans cet id coûtait un aller-retour Auth caché).
   * Sinon, retombe sur `getUser()` comme avant.
   */
  actorId?: string;
}

/**
 * Journalise une action métier (section 34 du cahier des charges). Utilise
 * le client "utilisateur courant" : la policy audit_logs_insert exige
 * actor_id = auth.uid(), donc l'entrée est toujours attribuée à l'auteur
 * réel de l'action, y compris quand un admin agit pour un tiers.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createClient();

  let actorId = entry.actorId;
  if (!actorId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    actorId = user.id;
  }

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
}
