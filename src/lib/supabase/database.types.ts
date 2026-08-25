/**
 * Types de la base de données — écrits à la main pour refléter
 * supabase/migrations/*.sql. À régénérer avec `supabase gen types typescript`
 * une fois le projet Supabase provisionné, pour rester en phase avec le schéma réel.
 *
 * Note : les types `Insert` sont volontairement écrits comme des objets
 * littéraux (champs optionnels marqués `?`) plutôt que via `Partial<Row> &
 * Pick<...>` — cette dernière forme casse l'inférence de ligne de
 * `@supabase/supabase-js` (les colonnes remontent en `never`).
 */

export type AppRole = "admin" | "du_head" | "tribe_lead" | "squad_lead" | "employee";
export type EmployeeTypeCode = "internal" | "external";
export type AccountStatus = "active" | "inactive";
export type PlanStatus = "draft" | "submitted" | "validated" | "rejected" | "needs_changes";
export type HolidayTypeCode = "national" | "religious" | "exceptional";
export type HolidayStatusCode = "provisional" | "confirmed";
export type ExceptionTypeCode =
  | "mandatory_office"
  | "telework_forbidden"
  | "telework_allowed"
  | "site_closure"
  | "company_event"
  | "seminar"
  | "custom_period";
export type ExceptionScopeCode = "company" | "squad" | "employee";
export type AbsenceSourceCode = "hierarchy" | "admin" | "employee" | "rh_import";

export type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  email: string | null;
  role: AppRole;
  employee_type: EmployeeTypeCode | null;
  squad_id: string | null;
  status: AccountStatus;
  must_change_password: boolean;
  hire_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileInsert = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  email?: string | null;
  role?: AppRole;
  employee_type?: EmployeeTypeCode | null;
  squad_id?: string | null;
  status?: AccountStatus;
  must_change_password?: boolean;
  hire_date?: string | null;
  created_by?: string | null;
}

export type OrganizationalUnitRow = {
  id: string;
  name: string;
  manager_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type OrganizationalUnitInsert = {
  name: string;
  manager_id?: string | null;
  created_by?: string | null;
}

export type TribeRow = {
  id: string;
  name: string;
  organizational_unit_id: string;
  manager_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type TribeInsert = {
  name: string;
  organizational_unit_id: string;
  manager_id?: string | null;
  created_by?: string | null;
}

export type SquadRow = {
  id: string;
  name: string;
  tribe_id: string;
  manager_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type SquadInsert = {
  name: string;
  tribe_id: string;
  manager_id?: string | null;
  created_by?: string | null;
}

export type MembershipChangeRow = {
  id: string;
  profile_id: string;
  previous_squad_id: string | null;
  new_squad_id: string | null;
  effective_date: string;
  changed_by: string | null;
  created_at: string;
}

export type MembershipChangeInsert = {
  profile_id: string;
  previous_squad_id?: string | null;
  new_squad_id?: string | null;
  effective_date?: string;
  changed_by?: string | null;
}

export type RuleOverrideRow = {
  id: string;
  employee_id: string;
  weekly_quota: number;
  reason: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export type RuleOverrideInsert = {
  employee_id: string;
  weekly_quota: number;
  reason?: string | null;
  active?: boolean;
  created_by?: string | null;
}

export type WeeklyPlanRow = {
  id: string;
  employee_id: string;
  week_start: string;
  status: PlanStatus;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  manager_comment: string | null;
  previous_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export type WeeklyPlanInsert = {
  employee_id: string;
  week_start: string;
  status?: PlanStatus;
}

export type TeleworkDayRow = {
  id: string;
  weekly_plan_id: string;
  work_date: string;
  created_at: string;
}

export type TeleworkDayInsert = {
  weekly_plan_id: string;
  work_date: string;
}

export type AbsenceTypeRow = {
  id: string;
  name: string;
  code: string;
  triggers_return_rule: boolean;
  active: boolean;
  created_at: string;
}

export type AbsenceTypeInsert = {
  name: string;
  code: string;
  triggers_return_rule?: boolean;
  active?: boolean;
}

export type AbsenceRow = {
  id: string;
  employee_id: string;
  absence_type_id: string;
  start_date: string;
  end_date: string;
  comment: string | null;
  source: AbsenceSourceCode;
  created_by: string | null;
  created_at: string;
}

export type AbsenceInsert = {
  employee_id: string;
  absence_type_id: string;
  start_date: string;
  end_date: string;
  comment?: string | null;
  source?: AbsenceSourceCode;
  created_by?: string | null;
}

export type PublicHolidayRow = {
  id: string;
  name: string;
  date: string;
  type: HolidayTypeCode;
  status: HolidayStatusCode;
  source: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicHolidayInsert = {
  name: string;
  date: string;
  type?: HolidayTypeCode;
  status?: HolidayStatusCode;
  source?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export type CompanyExceptionRow = {
  id: string;
  name: string;
  type: ExceptionTypeCode;
  start_date: string;
  end_date: string;
  scope: ExceptionScopeCode;
  squad_id: string | null;
  employee_id: string | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export type CompanyExceptionInsert = {
  name: string;
  type: ExceptionTypeCode;
  start_date: string;
  end_date: string;
  scope?: ExceptionScopeCode;
  squad_id?: string | null;
  employee_id?: string | null;
  comment?: string | null;
  created_by?: string | null;
}

export type TeleworkRuleRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type TeleworkRuleInsert = {
  key: string;
  value: unknown;
  description?: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

export type AppSettingRow = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export type AppSettingInsert = {
  key: string;
  value: unknown;
  updated_by?: string | null;
  updated_at?: string;
}

export type NotificationRow = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  read: boolean;
  email_sent: boolean;
  created_at: string;
}

export type NotificationInsert = {
  recipient_id: string;
  type: string;
  title: string;
  body?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  read?: boolean;
  email_sent?: boolean;
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export type AuditLogInsert = {
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
}

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, ProfileInsert, Partial<ProfileRow>>;
      organizational_units: Table<OrganizationalUnitRow, OrganizationalUnitInsert, Partial<OrganizationalUnitRow>>;
      tribes: Table<TribeRow, TribeInsert, Partial<TribeRow>>;
      squads: Table<SquadRow, SquadInsert, Partial<SquadRow>>;
      membership_changes: Table<MembershipChangeRow, MembershipChangeInsert, Partial<MembershipChangeRow>>;
      rule_overrides: Table<RuleOverrideRow, RuleOverrideInsert, Partial<RuleOverrideRow>>;
      weekly_plans: Table<WeeklyPlanRow, WeeklyPlanInsert, Partial<WeeklyPlanRow>>;
      telework_days: Table<TeleworkDayRow, TeleworkDayInsert, Partial<TeleworkDayRow>>;
      absence_types: Table<AbsenceTypeRow, AbsenceTypeInsert, Partial<AbsenceTypeRow>>;
      absences: Table<AbsenceRow, AbsenceInsert, Partial<AbsenceRow>>;
      public_holidays: Table<PublicHolidayRow, PublicHolidayInsert, Partial<PublicHolidayRow>>;
      company_exceptions: Table<CompanyExceptionRow, CompanyExceptionInsert, Partial<CompanyExceptionRow>>;
      telework_rules: Table<TeleworkRuleRow, TeleworkRuleInsert, Partial<TeleworkRuleRow>>;
      app_settings: Table<AppSettingRow, AppSettingInsert, Partial<AppSettingRow>>;
      notifications: Table<NotificationRow, NotificationInsert, Partial<NotificationRow>>;
      audit_logs: Table<AuditLogRow, AuditLogInsert, Partial<AuditLogRow>>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_notification: {
        Args: {
          p_recipient_id: string;
          p_type: string;
          p_title: string;
          p_body: string | null;
          p_related_entity_type: string | null;
          p_related_entity_id: string | null;
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
