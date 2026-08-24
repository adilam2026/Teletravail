import "server-only";
import type { AppSupabaseClient as DB } from "@/lib/supabase/server";

export interface NotifyInput {
  recipientId: string;
  type: string;
  title: string;
  body?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/** Passe par la fonction SQL `create_notification` (security definer) : voir migration 0002. */
export async function notify(supabase: DB, input: NotifyInput): Promise<void> {
  await supabase.rpc("create_notification", {
    p_recipient_id: input.recipientId,
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? null,
    p_related_entity_type: input.relatedEntityType ?? null,
    p_related_entity_id: input.relatedEntityId ?? null,
  });
}
