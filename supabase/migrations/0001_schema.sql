-- ============================================================================
-- Télétravail — schéma initial
-- ============================================================================
-- Toutes les dates métier sont interprétées dans le fuseau Africa/Casablanca
-- par la couche applicative (voir src/lib/date). Les colonnes `date` restent
-- des dates civiles sans fuseau ; les colonnes `timestamptz` sont en UTC.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
create type app_role as enum ('admin', 'manager', 'employee');
create type employee_type as enum ('internal', 'external');
create type account_status as enum ('active', 'inactive');
create type plan_status as enum ('draft', 'submitted', 'validated', 'rejected', 'needs_changes');
create type holiday_type as enum ('national', 'religious', 'exceptional');
create type holiday_status as enum ('provisional', 'confirmed');
create type exception_type as enum (
  'mandatory_office', 'telework_forbidden', 'telework_allowed',
  'site_closure', 'company_event', 'seminar', 'custom_period'
);
create type exception_scope as enum ('company', 'team', 'employee');
create type absence_source as enum ('manager', 'admin', 'employee', 'rh_import');

-- ----------------------------------------------------------------------------
-- profiles & teams (FK circulaire résolue via ALTER TABLE plus bas)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  login text not null unique,
  email text,
  role app_role not null default 'employee',
  employee_type employee_type,
  manager_id uuid references profiles (id),
  team_id uuid,
  status account_status not null default 'active',
  must_change_password boolean not null default true,
  hire_date date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid references profiles (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_team_id_fkey foreign key (team_id) references teams (id);

create index idx_profiles_team_id on profiles (team_id);
create index idx_profiles_manager_id on profiles (manager_id);
create index idx_profiles_role on profiles (role);
create index idx_teams_manager_id on teams (manager_id);

-- ----------------------------------------------------------------------------
-- rule_overrides — quota individuel exceptionnel (prévaut sur le quota standard)
-- ----------------------------------------------------------------------------
create table rule_overrides (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  weekly_quota integer not null check (weekly_quota >= 0 and weekly_quota <= 5),
  reason text,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index idx_rule_overrides_employee on rule_overrides (employee_id) where active;

-- ----------------------------------------------------------------------------
-- weekly_plans & telework_days
-- ----------------------------------------------------------------------------
create table weekly_plans (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  week_start date not null, -- lundi de la semaine, Africa/Casablanca
  status plan_status not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references profiles (id),
  manager_comment text,
  previous_version_id uuid references weekly_plans (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

create index idx_weekly_plans_employee on weekly_plans (employee_id, week_start);
create index idx_weekly_plans_status on weekly_plans (status);

create table telework_days (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_plans (id) on delete cascade,
  work_date date not null,
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, work_date)
);

create index idx_telework_days_plan on telework_days (weekly_plan_id);
create index idx_telework_days_date on telework_days (work_date);

-- ----------------------------------------------------------------------------
-- absences
-- ----------------------------------------------------------------------------
create table absence_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  triggers_return_rule boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  absence_type_id uuid not null references absence_types (id),
  start_date date not null,
  end_date date not null,
  comment text,
  source absence_source not null default 'manager',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint absences_date_order check (end_date >= start_date)
);

create index idx_absences_employee on absences (employee_id, start_date, end_date);

-- ----------------------------------------------------------------------------
-- jours fériés & exceptions
-- ----------------------------------------------------------------------------
create table public_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  type holiday_type not null default 'national',
  status holiday_status not null default 'confirmed',
  source text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, name)
);

create index idx_public_holidays_date on public_holidays (date);

create table company_exceptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type exception_type not null,
  start_date date not null,
  end_date date not null,
  scope exception_scope not null default 'company',
  team_id uuid references teams (id),
  employee_id uuid references profiles (id),
  comment text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint company_exceptions_date_order check (end_date >= start_date)
);

create index idx_company_exceptions_dates on company_exceptions (start_date, end_date);

-- ----------------------------------------------------------------------------
-- paramétrage (clé/valeur) — règles télétravail & réglages applicatifs
-- ----------------------------------------------------------------------------
create table telework_rules (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications & audit_logs
-- ----------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_entity_type text,
  related_entity_id text,
  read boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient on notifications (recipient_id, read);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_actor on audit_logs (actor_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_weekly_plans_updated_at before update on weekly_plans
  for each row execute function set_updated_at();
create trigger trg_public_holidays_updated_at before update on public_holidays
  for each row execute function set_updated_at();
