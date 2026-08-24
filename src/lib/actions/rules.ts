"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";

/** Met à jour une clé du moteur de règles (Administration > Règles télétravail). Chaque changement est historisé. */
export async function updateRuleSetting(key: string, value: unknown): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();

  const { data: before } = await supabase.from("telework_rules").select("value").eq("key", key).maybeSingle();

  const { error } = await supabase
    .from("telework_rules")
    .upsert({ key, value: value as never, updated_by: profile.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Mise à jour impossible." };

  await logAudit({ action: "rule_updated", entityType: "telework_rule", entityId: key, oldValue: before?.value, newValue: value });
  revalidatePath("/admin/rules");
  revalidatePath("/employee/agenda");
  revalidatePath("/manager/planning");
  return { ok: true };
}

export async function updateAppSetting(key: string, value: unknown): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();

  const { data: before } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value: value as never, updated_by: profile.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Mise à jour impossible." };

  await logAudit({ action: "setting_updated", entityType: "app_setting", entityId: key, oldValue: before?.value, newValue: value });
  revalidatePath("/admin/settings");
  return { ok: true };
}
