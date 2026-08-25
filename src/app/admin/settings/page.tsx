import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SettingsEditor } from "@/components/admin/SettingsEditor";

export default async function AdminSettingsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: rows } = await supabase.from("app_settings").select("key, value");
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Paramètres</h1>
        <p className="text-sm text-slate-500">Réglages généraux de l&apos;application</p>
      </div>

      <SettingsEditor
        allowAdminCreateAdmin={map.get("allow_admin_create_admin") === true}
        allowEmployeeSelfAbsence={map.get("allow_employee_self_absence") === true}
        duHeadAutoValidate={map.get("du_head_auto_validate") === true}
      />
    </div>
  );
}
