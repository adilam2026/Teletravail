"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppSetting } from "@/lib/actions/rules";

export interface SettingsEditorProps {
  allowAdminCreateAdmin: boolean;
  allowManagerCreateManager: boolean;
  allowEmployeeSelfAbsence: boolean;
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
        label="Autoriser un manager à créer d'autres managers"
        checked={values.allowManagerCreateManager}
        disabled={pending}
        onChange={() => toggle("allowManagerCreateManager", "allow_manager_create_manager")}
      />
      <Toggle
        label="Autoriser un collaborateur à déclarer lui-même une absence"
        checked={values.allowEmployeeSelfAbsence}
        disabled={pending}
        onChange={() => toggle("allowEmployeeSelfAbsence", "allow_employee_self_absence")}
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
