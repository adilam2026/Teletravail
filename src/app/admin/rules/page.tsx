import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRuleSettings } from "@/lib/data/planning";
import { RulesEditor } from "@/components/admin/RulesEditor";
import { AbsenceTypeToggle } from "@/components/admin/AbsenceTypeToggle";

export default async function AdminRulesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [settings, { data: absenceTypes }] = await Promise.all([
    getRuleSettings(supabase),
    supabase.from("absence_types").select("*").order("name"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Règles télétravail</h1>
        <p className="text-sm text-slate-500">Chaque modification est historisée dans le journal d&apos;audit</p>
      </div>

      <RulesEditor initial={settings} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Types d&apos;absence</h2>
        <div className="card divide-y divide-slate-100 p-0">
          {(absenceTypes ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-slate-800">{t.name}</span>
              <AbsenceTypeToggle id={t.id} triggersReturnRule={t.triggers_return_rule} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
