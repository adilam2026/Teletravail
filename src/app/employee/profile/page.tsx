import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getResolvedQuota, getRuleSettings } from "@/lib/data/planning";
import { getDuLedBy, getSquadLedBy, getTribeLedBy } from "@/lib/data/hierarchy";
import { EditOwnProfileForm } from "@/components/employee/EditOwnProfileForm";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

export default async function EmployeeProfilePage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const settings = await getRuleSettings(supabase);
  const quota = await getResolvedQuota(supabase, profile, settings);

  const orgFields: [string, string][] = [];

  if (profile.squad_id) {
    const { data: squad } = await supabase.from("squads").select("name, manager_id").eq("id", profile.squad_id).maybeSingle();
    orgFields.push(["Squad", squad?.name ?? "—"]);
    if (squad?.manager_id) {
      const { data: lead } = await supabase.from("profiles").select("first_name, last_name").eq("id", squad.manager_id).maybeSingle();
      orgFields.push(["Squad Lead", lead ? `${lead.first_name} ${lead.last_name}` : "—"]);
    }
  }

  if (profile.role === "squad_lead") {
    const squad = await getSquadLedBy(supabase, profile.id);
    orgFields.push(["Ma Squad", squad?.name ?? "—"]);
    if (squad) {
      const { data: t } = await supabase.from("tribes").select("name, manager_id").eq("id", squad.tribe_id).maybeSingle();
      orgFields.push(["Tribe", t?.name ?? "—"]);
      if (t?.manager_id) {
        const { data: lead } = await supabase.from("profiles").select("first_name, last_name").eq("id", t.manager_id).maybeSingle();
        orgFields.push(["Tribe Lead", lead ? `${lead.first_name} ${lead.last_name}` : "—"]);
      }
    }
  }

  if (profile.role === "tribe_lead") {
    const tribe = await getTribeLedBy(supabase, profile.id);
    orgFields.push(["Ma Tribe", tribe?.name ?? "—"]);
    if (tribe) {
      const { data: du } = await supabase.from("organizational_units").select("name, manager_id").eq("id", tribe.organizational_unit_id).maybeSingle();
      orgFields.push(["DU", du?.name ?? "—"]);
      if (du?.manager_id) {
        const { data: head } = await supabase.from("profiles").select("first_name, last_name").eq("id", du.manager_id).maybeSingle();
        orgFields.push(["Responsable DU", head ? `${head.first_name} ${head.last_name}` : "—"]);
      }
    }
  }

  if (profile.role === "du_head") {
    const du = await getDuLedBy(supabase, profile.id);
    orgFields.push(["Ma DU", du?.name ?? "—"]);
  }

  const fields: [string, string][] = [
    ["Identifiant", profile.login],
    ["Email", profile.email ?? "—"],
    ["Niveau hiérarchique", ROLE_LABELS[profile.role] ?? profile.role],
    ["Type", profile.employee_type === "internal" ? "Interne" : profile.employee_type === "external" ? "Externe" : "—"],
    ["Quota télétravail", `${quota} jour${quota > 1 ? "s" : ""} / semaine`],
    ...orgFields,
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Mon profil</h1>

      <div className="card">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EditOwnProfileForm userId={profile.id} firstName={profile.first_name} lastName={profile.last_name} />
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
