#!/usr/bin/env node
/**
 * Crée le tout premier compte administrateur, une fois les migrations
 * appliquées. Les comptes suivants se créent ensuite depuis l'application
 * (Administration > Utilisateurs), jamais via ce script.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/bootstrap-admin.mjs "Adil" "Nom" adil adil@example.com
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [firstName, lastName, login, email] = process.argv.slice(2);

if (!firstName || !lastName || !login) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <prenom> <nom> <login> [email]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const finalEmail = email ?? `${login.toLowerCase()}@teletravail.local`;
const tempPassword = randomBytes(9).toString("base64url");

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: finalEmail,
  password: tempPassword,
  email_confirm: true,
});
if (createError || !created.user) {
  console.error("Échec de création du compte Auth :", createError?.message);
  process.exit(1);
}

const { error: profileError } = await admin.from("profiles").insert({
  id: created.user.id,
  first_name: firstName,
  last_name: lastName,
  login: login.toLowerCase(),
  email: finalEmail,
  role: "admin",
  status: "active",
  must_change_password: true,
});

if (profileError) {
  console.error("Échec de création du profil :", profileError.message);
  await admin.auth.admin.deleteUser(created.user.id);
  process.exit(1);
}

console.log("Administrateur créé avec succès.");
console.log(`Identifiant : ${login}`);
console.log(`Mot de passe provisoire : ${tempPassword}`);
console.log("Le changement de mot de passe sera exigé à la première connexion.");
