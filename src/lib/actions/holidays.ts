"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";
import type { HolidayStatusCode, HolidayTypeCode } from "@/lib/supabase/database.types";

export interface HolidayInput {
  name: string;
  date: string;
  type: HolidayTypeCode;
  status: HolidayStatusCode;
  source?: string;
}

export async function createHoliday(input: HolidayInput): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_holidays")
    .insert({ ...input, created_by: profile.id, updated_by: profile.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "holiday_created", entityType: "public_holiday", entityId: data.id, newValue: input });
  revalidateHolidayViews();
  return { ok: true };
}

export async function updateHoliday(id: string, input: Partial<HolidayInput>): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data: before } = await supabase.from("public_holidays").select("*").eq("id", id).single();

  const { error } = await supabase.from("public_holidays").update({ ...input, updated_by: profile.id }).eq("id", id);
  if (error) return { ok: false, error: "Modification impossible." };

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
  revalidatePath("/employee/agenda");
  revalidatePath("/manager/planning");
}
