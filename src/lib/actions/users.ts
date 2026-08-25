"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";
import { syntheticEmail } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { getDuLedBy, getSquadLedBy, getTribeLedBy } from "@/lib/data/hierarchy";
import type { AppRole, EmployeeTypeCode, ProfileRow } from "@/lib/supabase/database.types";

const ROLE_RANK: Record<AppRole, number> = { admin: 100, du_head: 40, tribe_lead: 30, squad_lead: 20, employee: 10 };

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  login: string;
  email?: string;
  role: AppRole;
  employeeType: EmployeeTypeCode;
  hireDate?: string | null;
  individualQuota?: number | null;
  /** Rattachement — selon le rôle cible (voir sections 24-25 du cahier des charges). */
  squadId?: string | null;
  newSquadName?: string;
  tribeId?: string | null;
  newTribeName?: string;
  organizationalUnitId?: string | null;
  newOrgUnitName?: string;
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

function revalidateHierarchyViews() {
  revalidatePath("/admin/users");
  revalidatePath("/squad/team");
  revalidatePath("/tribe/overview");
  revalidatePath("/du/overview");
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (ROLE_RANK[input.role] >= ROLE_RANK[actor.role]) {
    return { ok: false, error: "Vous ne pouvez pas créer un compte de niveau égal ou supérieur au vôtre." };
  }
  if (!input.firstName.trim() || !input.lastName.trim() || !input.login.trim()) {
    return { ok: false, error: "Prénom, nom et identifiant sont obligatoires." };
  }
  if (!input.employeeType) {
    return { ok: false, error: "Le type (interne/externe) est obligatoire." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  if (input.role === "admin") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "allow_admin_create_admin").maybeSingle();
    if (setting?.value !== true) {
      return { ok: false, error: "La création d'administrateurs supplémentaires n'est pas autorisée (voir Paramètres)." };
    }
  }

  let squadId: string | null = null;
  let newSquadToCreate: { name: string; tribeId: string } | null = null;
  let newTribeToCreate: { name: string; organizationalUnitId: string } | null = null;
  let newOrgUnitToCreate: { name: string } | null = null;
  let claimSquadId: string | null = null;
  let claimTribeId: string | null = null;
  let claimOrgUnitId: string | null = null;

  if (input.role === "employee") {
    let targetSquadId = input.squadId ?? null;
    if (actor.role === "squad_lead") {
      const own = await getSquadLedBy(supabase, actor.id);
      if (!own) return { ok: false, error: "Aucune Squad ne vous est rattachée." };
      targetSquadId = own.id;
    } else if (actor.role === "tribe_lead") {
      if (!targetSquadId) return { ok: false, error: "Sélectionnez la Squad de ce collaborateur." };
      const tribe = await getTribeLedBy(supabase, actor.id);
      const { data: squad } = await supabase.from("squads").select("id, tribe_id").eq("id", targetSquadId).maybeSingle();
      if (!tribe || !squad || squad.tribe_id !== tribe.id) return { ok: false, error: "Cette Squad n'appartient pas à votre Tribe." };
    } else if (actor.role === "du_head") {
      if (!targetSquadId) return { ok: false, error: "Sélectionnez la Squad de ce collaborateur." };
      const du = await getDuLedBy(supabase, actor.id);
      const { data: squad } = await supabase.from("squads").select("id, tribe_id").eq("id", targetSquadId).maybeSingle();
      const { data: tribe } = squad
        ? await supabase.from("tribes").select("organizational_unit_id").eq("id", squad.tribe_id).maybeSingle()
        : { data: null };
      if (!du || !squad || !tribe || tribe.organizational_unit_id !== du.id) return { ok: false, error: "Cette Squad n'appartient pas à votre DU." };
    } else if (!targetSquadId) {
      return { ok: false, error: "Sélectionnez la Squad de ce collaborateur." };
    }
    squadId = targetSquadId;
  }

  if (input.role === "squad_lead") {
    if (input.squadId) {
      const { data: squad } = await supabase.from("squads").select("id, tribe_id, manager_id").eq("id", input.squadId).maybeSingle();
      if (!squad) return { ok: false, error: "Squad introuvable." };
      if (squad.manager_id) return { ok: false, error: "Cette Squad a déjà un Squad Lead." };
      if (actor.role === "tribe_lead") {
        const tribe = await getTribeLedBy(supabase, actor.id);
        if (!tribe || squad.tribe_id !== tribe.id) return { ok: false, error: "Cette Squad n'appartient pas à votre Tribe." };
      }
      claimSquadId = squad.id;
    } else {
      if (!input.newSquadName?.trim()) return { ok: false, error: "Indiquez le nom de la nouvelle Squad." };
      let tribeId = input.tribeId ?? null;
      if (actor.role === "tribe_lead") {
        const tribe = await getTribeLedBy(supabase, actor.id);
        if (!tribe) return { ok: false, error: "Aucune Tribe ne vous est rattachée." };
        tribeId = tribe.id;
      } else if (actor.role === "du_head") {
        if (!tribeId) return { ok: false, error: "Sélectionnez la Tribe de cette Squad." };
        const du = await getDuLedBy(supabase, actor.id);
        const { data: tribe } = await supabase.from("tribes").select("organizational_unit_id").eq("id", tribeId).maybeSingle();
        if (!du || !tribe || tribe.organizational_unit_id !== du.id) return { ok: false, error: "Cette Tribe n'appartient pas à votre DU." };
      } else if (!tribeId) {
        return { ok: false, error: "Sélectionnez la Tribe de cette Squad." };
      }
      newSquadToCreate = { name: input.newSquadName.trim(), tribeId: tribeId! };
    }
  }

  if (input.role === "tribe_lead") {
    if (input.tribeId) {
      const { data: tribe } = await supabase.from("tribes").select("id, organizational_unit_id, manager_id").eq("id", input.tribeId).maybeSingle();
      if (!tribe) return { ok: false, error: "Tribe introuvable." };
      if (tribe.manager_id) return { ok: false, error: "Cette Tribe a déjà un Tribe Lead." };
      if (actor.role === "du_head") {
        const du = await getDuLedBy(supabase, actor.id);
        if (!du || tribe.organizational_unit_id !== du.id) return { ok: false, error: "Cette Tribe n'appartient pas à votre DU." };
      }
      claimTribeId = tribe.id;
    } else {
      if (!input.newTribeName?.trim()) return { ok: false, error: "Indiquez le nom de la nouvelle Tribe." };
      let orgUnitId = input.organizationalUnitId ?? null;
      if (actor.role === "du_head") {
        const du = await getDuLedBy(supabase, actor.id);
        if (!du) return { ok: false, error: "Aucune DU ne vous est rattachée." };
        orgUnitId = du.id;
      } else if (!orgUnitId) {
        return { ok: false, error: "Sélectionnez la DU de cette Tribe." };
      }
      newTribeToCreate = { name: input.newTribeName.trim(), organizationalUnitId: orgUnitId! };
    }
  }

  if (input.role === "du_head") {
    if (input.organizationalUnitId) {
      const { data: du } = await supabase.from("organizational_units").select("id, manager_id").eq("id", input.organizationalUnitId).maybeSingle();
      if (!du) return { ok: false, error: "DU introuvable." };
      if (du.manager_id) return { ok: false, error: "Cette DU a déjà un Responsable." };
      claimOrgUnitId = du.id;
    } else {
      if (!input.newOrgUnitName?.trim()) return { ok: false, error: "Indiquez le nom de la nouvelle DU." };
      newOrgUnitToCreate = { name: input.newOrgUnitName.trim() };
    }
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

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    login: input.login.trim().toLowerCase(),
    email,
    role: input.role,
    employee_type: input.employeeType,
    squad_id: squadId,
    status: "active",
    must_change_password: true,
    hire_date: input.hireDate ?? null,
    created_by: actor.id,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Impossible de créer le profil utilisateur." };
  }

  if (input.role === "squad_lead") {
    if (newSquadToCreate) {
      await admin.from("squads").insert({ name: newSquadToCreate.name, tribe_id: newSquadToCreate.tribeId, manager_id: created.user.id, created_by: actor.id });
    } else if (claimSquadId) {
      await admin.from("squads").update({ manager_id: created.user.id }).eq("id", claimSquadId);
    }
  }
  if (input.role === "tribe_lead") {
    if (newTribeToCreate) {
      await admin.from("tribes").insert({ name: newTribeToCreate.name, organizational_unit_id: newTribeToCreate.organizationalUnitId, manager_id: created.user.id, created_by: actor.id });
    } else if (claimTribeId) {
      await admin.from("tribes").update({ manager_id: created.user.id }).eq("id", claimTribeId);
    }
  }
  if (input.role === "du_head") {
    if (newOrgUnitToCreate) {
      await admin.from("organizational_units").insert({ name: newOrgUnitToCreate.name, manager_id: created.user.id, created_by: actor.id });
    } else if (claimOrgUnitId) {
      await admin.from("organizational_units").update({ manager_id: created.user.id }).eq("id", claimOrgUnitId);
    }
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
    newValue: { role: input.role, employeeType: input.employeeType, squadId },
  });

  revalidateHierarchyViews();
  return { ok: true, temporaryPassword: tempPassword, userId: created.user.id };
}

export interface UpdateUserInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  employeeType?: EmployeeTypeCode | null;
  squadId?: string | null;
  hireDate?: string | null;
  role?: AppRole;
}

export async function updateUser(input: UpdateUserInput): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase.from("profiles").select("*").eq("id", input.userId).single();
  if (!before) return { ok: false, error: "Utilisateur introuvable." };

  const patch: Partial<ProfileRow> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.employeeType !== undefined) patch.employee_type = input.employeeType;
  if (input.hireDate !== undefined) patch.hire_date = input.hireDate;
  if (actor.role === "admin" && input.role !== undefined) patch.role = input.role;

  const squadChanged = input.squadId !== undefined && input.squadId !== before.squad_id;
  if (squadChanged) patch.squad_id = input.squadId;

  const { error } = await supabase.from("profiles").update(patch).eq("id", input.userId);
  if (error) return { ok: false, error: "Modification impossible (droits insuffisants ?)." };

  if (squadChanged) {
    await supabase.from("membership_changes").insert({
      profile_id: input.userId,
      previous_squad_id: before.squad_id,
      new_squad_id: input.squadId ?? null,
      changed_by: actor.id,
    });
    await logAudit({
      action: "squad_changed",
      entityType: "profile",
      entityId: input.userId,
      oldValue: { squadId: before.squad_id },
      newValue: { squadId: input.squadId },
    });
  }

  await logAudit({ action: "user_updated", entityType: "profile", entityId: input.userId, oldValue: before, newValue: patch });
  revalidateHierarchyViews();
  return { ok: true };
}

export async function setUserStatus(userId: string, status: "active" | "inactive"): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (status === "inactive" && userId === actor.id) {
    return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) return { ok: false, error: "Action impossible (droits insuffisants ?)." };

  await logAudit({ action: status === "active" ? "user_reactivated" : "user_deactivated", entityType: "profile", entityId: userId });
  revalidateHierarchyViews();
  return { ok: true };
}

/**
 * Suppression définitive d'un compte (profil applicatif + compte Supabase
 * Auth), distincte de la désactivation. Contrairement au statut, il n'existe
 * aucune politique RLS "delete" sur profiles (suppression jamais autorisée
 * en direct) : l'autorisation est donc entièrement portée par ce contrôle
 * applicatif, puis exécutée avec le client admin (service role). Les données
 * possédées par l'utilisateur (semaines, absences, notifications...) sont
 * supprimées en cascade côté base ; les colonnes d'attribution (créé par,
 * validé par...) passent à NULL pour préserver l'historique restant.
 */
export async function deleteUser(userId: string): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (userId === actor.id) {
    return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, role, first_name, last_name, login").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, error: "Utilisateur introuvable." };
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
    return { ok: false, error: "Vous ne pouvez pas supprimer un compte de niveau égal ou supérieur au vôtre." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").delete().eq("id", userId);
  if (error) return { ok: false, error: "Suppression impossible." };

  await admin.auth.admin.deleteUser(userId);
  await logAudit({ action: "user_deleted", entityType: "profile", entityId: userId, oldValue: target });

  revalidateHierarchyViews();
  return { ok: true };
}

export async function resetUserPassword(userId: string): Promise<CreateUserResult> {
  const { profile: actor } = await requireUser();
  if (actor.role === "employee") return { ok: false, error: "Non autorisé." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id").eq("id", userId).single();
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  const admin = createAdminClient();
  const tempPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { ok: false, error: "Réinitialisation impossible." };

  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await logAudit({ action: "password_reset", entityType: "profile", entityId: userId });

  revalidateHierarchyViews();
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
