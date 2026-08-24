import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getResolvedQuota, getRuleSettings } from "@/lib/data/planning";

export default async function EmployeeProfilePage() {
  const { profile } = await requireRole("employee");
  const supabase = await createClient();

  const [settings, { data: team }, { data: manager }] = await Promise.all([
    getRuleSettings(supabase),
    profile.team_id ? supabase.from("teams").select("name").eq("id", profile.team_id).maybeSingle() : Promise.resolve({ data: null }),
    profile.manager_id
      ? supabase.from("profiles").select("first_name, last_name").eq("id", profile.manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const quota = await getResolvedQuota(supabase, profile, settings);

  const fields: [string, string][] = [
    ["Prénom", profile.first_name],
    ["Nom", profile.last_name],
    ["Identifiant", profile.login],
    ["Email", profile.email ?? "—"],
    ["Type", profile.employee_type === "internal" ? "Interne" : profile.employee_type === "external" ? "Externe" : "—"],
    ["Quota télétravail", `${quota} jour${quota > 1 ? "s" : ""} / semaine`],
    ["Équipe", team?.name ?? "—"],
    ["Manager", manager ? `${manager.first_name} ${manager.last_name}` : "—"],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Mon profil</h1>

      <div className="card">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-slate-800">Mot de passe</p>
        <p className="mt-1 text-sm text-slate-500">Vous pouvez changer votre mot de passe à tout moment.</p>
        <Link href="/change-password" className="btn-secondary mt-3 inline-flex">
          Changer mon mot de passe
        </Link>
      </div>
    </div>
  );
}
