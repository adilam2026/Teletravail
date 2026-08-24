"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRuleSetting } from "@/lib/actions/rules";
import type { RuleSettings } from "@/lib/rules-engine";

export function RulesEditor({ initial }: { initial: RuleSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function set<K extends keyof RuleSettings>(key: K, value: RuleSettings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      await Promise.all([
        updateRuleSetting("quota_internal", values.quotaInternal),
        updateRuleSetting("quota_external", values.quotaExternal),
        updateRuleSetting("consecutive_days_forbidden", values.consecutiveDaysForbidden),
        updateRuleSetting("monday_friday_forbidden", values.mondayFridayForbidden),
        updateRuleSetting("return_after_absence_forbidden", values.returnAfterAbsenceForbidden),
        updateRuleSetting("return_after_bridge_enabled", values.returnAfterBridgeEnabled),
        updateRuleSetting("rotation_enabled", values.rotationEnabled),
        updateRuleSetting("rotation_weeks", values.rotationWeeks),
        updateRuleSetting("rotation_threshold", values.rotationThreshold),
        updateRuleSetting("rotation_mode", values.rotationMode),
        updateRuleSetting("team_presence_min_percent", values.teamPresenceMinPercent),
        updateRuleSetting("team_presence_mode", values.teamPresenceMode),
        updateRuleSetting("submission_deadline_enabled", values.submissionDeadlineEnabled),
        updateRuleSetting("submission_deadline_weekday", values.submissionDeadlineWeekday),
        updateRuleSetting("submission_deadline_hour", values.submissionDeadlineHour),
        updateRuleSetting("submission_deadline_mode", values.submissionDeadlineMode),
      ]);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Quotas hebdomadaires</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Interne (jours / semaine)">
            <input type="number" min={0} max={5} className="input" value={values.quotaInternal} onChange={(e) => set("quotaInternal", Number(e.target.value))} />
          </Field>
          <Field label="Externe (jours / semaine)">
            <input type="number" min={0} max={5} className="input" value={values.quotaExternal} onChange={(e) => set("quotaExternal", Number(e.target.value))} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Règles de combinaison</h2>
        <Toggle label="Interdire les jours consécutifs" checked={values.consecutiveDaysForbidden} onChange={(v) => set("consecutiveDaysForbidden", v)} />
        <Toggle label="Interdire la combinaison lundi + vendredi" checked={values.mondayFridayForbidden} onChange={(v) => set("mondayFridayForbidden", v)} />
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Reprise après absence</h2>
        <Toggle label="Interdire le télétravail le jour de reprise" checked={values.returnAfterAbsenceForbidden} onChange={(v) => set("returnAfterAbsenceForbidden", v)} />
        <Toggle
          label="Étendre la règle à travers un week-end / jour férié"
          checked={values.returnAfterBridgeEnabled}
          onChange={(v) => set("returnAfterBridgeEnabled", v)}
        />
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Rotation des jours</h2>
        <Toggle label="Activer le contrôle de rotation" checked={values.rotationEnabled} onChange={(v) => set("rotationEnabled", v)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Semaines analysées">
            <input type="number" min={1} max={12} className="input" value={values.rotationWeeks} onChange={(e) => set("rotationWeeks", Number(e.target.value))} />
          </Field>
          <Field label="Seuil de déclenchement (0-1)">
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="input"
              value={values.rotationThreshold}
              onChange={(e) => set("rotationThreshold", Number(e.target.value))}
            />
          </Field>
          <Field label="Mode">
            <select className="input" value={values.rotationMode} onChange={(e) => set("rotationMode", e.target.value as RuleSettings["rotationMode"])}>
              <option value="information">Information</option>
              <option value="alert">Alerte</option>
              <option value="block">Blocage</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Présence minimale de l&apos;équipe</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Seuil minimum (%)">
            <input
              type="number"
              min={0}
              max={100}
              className="input"
              value={values.teamPresenceMinPercent}
              onChange={(e) => set("teamPresenceMinPercent", Number(e.target.value))}
            />
          </Field>
          <Field label="Mode de contrôle">
            <select
              className="input"
              value={values.teamPresenceMode}
              onChange={(e) => set("teamPresenceMode", e.target.value as RuleSettings["teamPresenceMode"])}
            >
              <option value="disabled">Aucun contrôle</option>
              <option value="alert">Alerte uniquement</option>
              <option value="block">Blocage</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Date limite de soumission</h2>
        <Toggle label="Activer la date limite" checked={values.submissionDeadlineEnabled} onChange={(v) => set("submissionDeadlineEnabled", v)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Jour limite (1=lundi ... 7=dimanche)">
            <input
              type="number"
              min={1}
              max={7}
              className="input"
              value={values.submissionDeadlineWeekday}
              onChange={(e) => set("submissionDeadlineWeekday", Number(e.target.value))}
            />
          </Field>
          <Field label="Heure limite (0-23)">
            <input
              type="number"
              min={0}
              max={23}
              className="input"
              value={values.submissionDeadlineHour}
              onChange={(e) => set("submissionDeadlineHour", Number(e.target.value))}
            />
          </Field>
          <Field label="Mode">
            <select
              className="input"
              value={values.submissionDeadlineMode}
              onChange={(e) => set("submissionDeadlineMode", e.target.value as RuleSettings["submissionDeadlineMode"])}
            >
              <option value="alert">Alerte</option>
              <option value="block">Blocage</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600">Enregistré.</span>}
        <button type="button" className="btn-primary" disabled={pending} onClick={handleSave}>
          {pending ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-slate-700">
      {label}
      <input type="checkbox" className="h-5 w-9" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
