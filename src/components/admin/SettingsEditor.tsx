"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppSetting } from "@/lib/actions/rules";

export interface SettingsEditorProps {
  allowAdminCreateAdmin: boolean;
  allowEmployeeSelfAbsence: boolean;
  duHeadAutoValidate: boolean;
}

export function SettingsEditor(initial: SettingsEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof SettingsEditorProps, settingKey: string) {
    const next = !values[key];
    setValues((prev) => ({ ...prev, [key]: next }));
    startTransition(async () => {
      await updateAppSetting(settingKey, next);
      router.refresh();
    });
  }

  return (
    <div className="card space-y-4">
      <Toggle
        label="Autoriser un administrateur à créer d'autres administrateurs"
        checked={values.allowAdminCreateAdmin}
        disabled={pending}
        onChange={() => toggle("allowAdminCreateAdmin", "allow_admin_create_admin")}
      />
      <Toggle
        label="Autoriser un collaborateur à déclarer lui-même une absence"
        checked={values.allowEmployeeSelfAbsence}
        disabled={pending}
        onChange={() => toggle("allowEmployeeSelfAbsence", "allow_employee_self_absence")}
      />
      <Toggle
        label="Valider automatiquement la semaine d'un Responsable DU (sinon transmise aux administrateurs)"
        checked={values.duHeadAutoValidate}
        disabled={pending}
        onChange={() => toggle("duHeadAutoValidate", "du_head_auto_validate")}
      />
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-slate-700">
      {label}
      <input type="checkbox" className="h-5 w-9" checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}
