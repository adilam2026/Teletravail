"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/actions/account";
import type { ExceptionScopeCode, ExceptionTypeCode } from "@/lib/supabase/database.types";

export interface ExceptionInput {
  name: string;
  type: ExceptionTypeCode;
  startDate: string;
  endDate: string;
  scope: ExceptionScopeCode;
  squadId?: string | null;
  employeeId?: string | null;
  comment?: string;
}

export async function createException(input: ExceptionInput): Promise<ActionResult> {
  const { profile } = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_exceptions")
    .insert({
      name: input.name,
      type: input.type,
      start_date: input.startDate,
      end_date: input.endDate,
      scope: input.scope,
      squad_id: input.scope === "squad" ? input.squadId ?? null : null,
      employee_id: input.scope === "employee" ? input.employeeId ?? null : null,
      comment: input.comment ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  await logAudit({ action: "exception_created", entityType: "company_exception", entityId: data.id, newValue: input });
  revalidateExceptionViews();
  return { ok: true };
}

export async function deleteException(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("company_exceptions").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };

  await logAudit({ action: "exception_deleted", entityType: "company_exception", entityId: id });
  revalidateExceptionViews();
  return { ok: true };
}

function revalidateExceptionViews() {
  revalidatePath("/admin/exceptions");
  revalidatePath("/employee/agenda");
  revalidatePath("/squad/team");
  revalidatePath("/tribe/overview");
  revalidatePath("/du/overview");
}
