"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { addDaysStr } from "@/lib/rules-engine/calendar";
import type { ActionResult } from "@/lib/actions/account";
import type { HolidayStatusCode, HolidayTypeCode } from "@/lib/supabase/database.types";

export interface HolidayInput {
  name: string;
  date: string;
  type: HolidayTypeCode;
  status: HolidayStatusCode;
  source?: string;
  /** Nombre de jours chômés consécutifs à partir de `date` (ex. 2 pour un Aïd sur deux jours). */
  durationDays?: number;
}

/**
 * Certains jours fériés (Aïd, notamment) couvrent plusieurs jours chômés
 * consécutifs : `durationDays` crée une ligne par jour plutôt que d'obliger
 * l'administrateur à répéter le formulaire. Chaque jour reste une ligne
 * indépendante ensuite (modifiable/supprimable seule), le moteur de règles
 * traitant déjà `public_holidays` comme une simple liste de dates.
 */
export async function createHoliday(input: HolidayInput): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { durationDays, ...base } = input;
  const days = Math.min(Math.max(durationDays ?? 1, 1), 10);

  const rows = Array.from({ length: days }, (_, i) => ({
    name: days > 1 ? `${base.name} (jour ${i + 1}/${days})` : base.name,
    date: addDaysStr(base.date, i),
    type: base.type,
    status: base.status,
    source: base.source,
    created_by: profile.id,
    updated_by: profile.id,
  }));

  const { data, error } = await supabase.from("public_holidays").insert(rows).select("id");
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "holiday_created", entityType: "public_holiday", entityId: data[0]!.id, newValue: input });
  revalidateHolidayViews();
  return { ok: true };
}

/**
 * `durationDays`, ici, ajoute des jours chômés supplémentaires consécutifs
 * après ce jour (ex. un jour férié saisi comme 1 jour puis annoncé sur 2 par
 * la suite) — jamais destructeur : il ne touche ni ne supprime les lignes
 * déjà existantes, il ne fait qu'en ajouter. Pour raccourcir un jour férié
 * déjà étendu, supprimer la ligne du jour en trop directement.
 */
export async function updateHoliday(id: string, input: Partial<HolidayInput>): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data: before } = await supabase.from("public_holidays").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Jour férié introuvable." };

  const { durationDays, ...patch } = input;
  const { error } = await supabase.from("public_holidays").update({ ...patch, updated_by: profile.id }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

  const extraDays = Math.min(Math.max((durationDays ?? 1) - 1, 0), 9);
  if (extraDays > 0) {
    const baseDate = patch.date ?? before.date;
    const rows = Array.from({ length: extraDays }, (_, i) => ({
      name: patch.name ?? before.name,
      date: addDaysStr(baseDate, i + 1),
      type: patch.type ?? before.type,
      status: patch.status ?? before.status,
      created_by: profile.id,
      updated_by: profile.id,
    }));
    const { error: insertError } = await supabase.from("public_holidays").insert(rows);
    if (insertError) return { ok: false, error: "Jour modifié, mais l'ajout des jours supplémentaires a échoué." };
  }

  await logAudit({ action: "holiday_updated", entityType: "public_holiday", entityId: id, oldValue: before, newValue: input });
  revalidateHolidayViews();
  return { ok: true };
}

export async function confirmHoliday(id: string): Promise<ActionResult> {
  return updateHoliday(id, { status: "confirmed" });
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("public_holidays").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };

  await logAudit({ action: "holiday_deleted", entityType: "public_holiday", entityId: id });
  revalidateHolidayViews();
  return { ok: true };
}

function revalidateHolidayViews() {
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/planning");
  revalidatePath("/employee/agenda");
  revalidatePath("/squad/planning");
  revalidatePath("/tribe/overview");
  revalidatePath("/du/overview");
}
