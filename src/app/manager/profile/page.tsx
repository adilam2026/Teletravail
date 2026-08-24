import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getManagerTeam } from "@/lib/data/team";

export default async function ManagerProfilePage() {
  const { profile } = await requireRole("manager");
  const supabase = await createClient();
  const { team, members } = await getManagerTeam(supabase, profile.id);

  const fields: [string, string][] = [
    ["Prénom", profile.first_name],
    ["Nom", profile.last_name],
    ["Identifiant", profile.login],
    ["Email", profile.email ?? "—"],
    ["Équipe", team?.name ?? "—"],
    ["Membres de l'équipe", String(members.length)],
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
