"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";
import { syntheticEmail } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import type { AppRole, EmployeeTypeCode, ProfileRow } from "@/lib/supabase/database.types";

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  login: string;
  email?: string;
  role: AppRole;
  employeeType?: EmployeeTypeCode;
  teamId?: string | null;
  newTeamName?: string;
  managerId?: string | null;
  hireDate?: string | null;
  individualQuota?: number | null;
}

export interface CreateUserResult {
  ok: boolean;
  error?: string;
  temporaryPassword?: string;
  userId?: string;
}

function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Non autorisé." };
  }
  if (!input.firstName.trim() || !input.lastName.trim() || !input.login.trim()) {
    return { ok: false, error: "Prénom, nom et identifiant sont obligatoires." };
  }
  if (input.role === "employee" && !input.employeeType) {
    return { ok: false, error: "Le type (interne/externe) est obligatoire pour un collaborateur." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  if (actor.role === "manager" && input.role !== "employee") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "allow_manager_create_manager").maybeSingle();
    if (input.role !== "manager" || setting?.value !== true) {
      return { ok: false, error: "Un manager ne peut créer que des collaborateurs." };
    }
  }
  if (actor.role === "admin" && input.role === "admin") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "allow_admin_create_admin").maybeSingle();
    if (setting?.value !== true) {
      return { ok: false, error: "La création d'administrateurs supplémentaires n'est pas autorisée (voir Paramètres)." };
    }
  }

  let teamId = input.teamId ?? null;

  if (actor.role === "manager") {
    const { data: team } = await supabase.from("teams").select("id").eq("manager_id", actor.id).maybeSingle();
    if (!team) return { ok: false, error: "Aucune équipe ne vous est rattachée. Contactez un administrateur." };
    teamId = team.id;
  }

  const email = input.email?.trim() || syntheticEmail(input.login);
  const tempPassword = generateTemporaryPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { ok: false, error: "Impossible de créer le compte (identifiant ou email déjà utilisé ?)." };
  }

  const employeeManagerId = actor.role === "manager" ? actor.id : input.managerId ?? null;

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    login: input.login.trim().toLowerCase(),
    email,
    role: input.role,
    employee_type: input.role === "employee" ? input.employeeType ?? null : null,
    manager_id: input.role === "employee" ? employeeManagerId : null,
    team_id: teamId,
    status: "active",
    must_change_password: true,
    hire_date: input.hireDate ?? null,
    created_by: actor.id,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Impossible de créer le profil utilisateur." };
  }

  if (input.role === "manager" && !teamId) {
    const teamName = input.newTeamName?.trim() || `Équipe de ${input.firstName} ${input.lastName}`;
    await admin.from("teams").insert({ name: teamName, manager_id: created.user.id, created_by: actor.id });
  }

  if (input.individualQuota !== undefined && input.individualQuota !== null) {
    await admin.from("rule_overrides").insert({
      employee_id: created.user.id,
      weekly_quota: input.individualQuota,
      reason: "Défini à la création du compte",
      created_by: actor.id,
    });
  }

  await logAudit({
    action: "user_created",
    entityType: "profile",
    entityId: created.user.id,
    newValue: { role: input.role, employeeType: input.employeeType, teamId },
  });

  revalidatePath("/admin/users");
  revalidatePath("/manager/team");
  return { ok: true, temporaryPassword: tempPassword, userId: created.user.id };
}

export interface UpdateUserInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  employeeType?: EmployeeTypeCode | null;
  teamId?: string | null;
  managerId?: string | null;
  hireDate?: string | null;
  role?: AppRole;
}

export async function updateUser(input: UpdateUserInput): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const patch: Partial<ProfileRow> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.employeeType !== undefined) patch.employee_type = input.employeeType;
  if (input.hireDate !== undefined) patch.hire_date = input.hireDate;
  if (actor.role === "admin") {
    if (input.teamId !== undefined) patch.team_id = input.teamId;
    if (input.managerId !== undefined) patch.manager_id = input.managerId;
    if (input.role !== undefined) patch.role = input.role;
  }

  const { data: before } = await supabase.from("profiles").select("*").eq("id", input.userId).single();
  const { error } = await supabase.from("profiles").update(patch).eq("id", input.userId);
  if (error) return { ok: false, error: "Modification impossible (droits insuffisants ?)." };

  await logAudit({ action: "user_updated", entityType: "profile", entityId: input.userId, oldValue: before, newValue: patch });
  revalidatePath("/admin/users");
  revalidatePath("/manager/team");
  return { ok: true };
}

export async function setUserStatus(userId: string, status: "active" | "inactive"): Promise<CreateUserResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) return { ok: false, error: "Action impossible (droits insuffisants ?)." };

  await logAudit({ action: status === "active" ? "user_reactivated" : "user_deactivated", entityType: "profile", entityId: userId });
  revalidatePath("/admin/users");
  revalidatePath("/manager/team");
  return { ok: true };
}

export async function resetUserPassword(userId: string): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (actor.role !== "admin" && actor.role !== "manager") return { ok: false, error: "Non autorisé." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, team_id").eq("id", userId).single();
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  const admin = createAdminClient();
  const tempPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { ok: false, error: "Réinitialisation impossible." };

  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await logAudit({ action: "password_reset", entityType: "profile", entityId: userId });

  revalidatePath("/admin/users");
  revalidatePath("/manager/team");
  return { ok: true, temporaryPassword: tempPassword };
}

export async function setIndividualQuota(userId: string, quota: number | null, reason?: string): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (actor.role !== "admin") return { ok: false, error: "Non autorisé." };

  const supabase = await createClient();
  await supabase.from("rule_overrides").update({ active: false }).eq("employee_id", userId).eq("active", true);

  if (quota !== null) {
    await supabase.from("rule_overrides").insert({ employee_id: userId, weekly_quota: quota, reason: reason ?? null, created_by: actor.id });
  }

  await logAudit({ action: "quota_override_changed", entityType: "profile", entityId: userId, newValue: { quota, reason } });
  revalidatePath("/admin/users");
  return { ok: true };
}
