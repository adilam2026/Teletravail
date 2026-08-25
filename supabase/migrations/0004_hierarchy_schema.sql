-- ============================================================================
-- Télétravail — hiérarchie organisationnelle DU / Tribe / Squad
-- ============================================================================
-- Remplace la logique plate manager/team par une hiérarchie à 4 niveaux :
--   Responsable DU -> Tribe Lead -> Squad Lead -> Collaborateur
-- Le niveau hiérarchique (role) et le type de profil télétravail
-- (employee_type: interne/externe) restent deux dimensions indépendantes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Purge des policies/fonctions/triggers v1 (plate manager/team). Le CASCADE
--    supprime toutes les policies qui en dépendent ; elles sont recréées
--    intégralement dans 0005_hierarchy_rls.sql.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_profiles_guard on profiles;
drop trigger if exists trg_weekly_plans_guard on weekly_plans;
drop function if exists public.profiles_guard() cascade;
drop function if exists public.weekly_plans_guard() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.current_team_id() cascade;
drop function if exists public.managed_team_ids() cascade;
drop function if exists public.is_manager_of(uuid) cascade;
drop function if exists public.is_self_or_privileged(uuid) cascade;

-- ----------------------------------------------------------------------------
-- 2. Retrait des colonnes/table v1 devenues obsolètes
-- ----------------------------------------------------------------------------
alter table company_exceptions drop column if exists team_id;
alter table profiles drop column if exists team_id;
alter table profiles drop column if exists manager_id;
drop table if exists teams;

-- ----------------------------------------------------------------------------
-- 3. Rôles hiérarchiques (remplace admin/manager/employee)
-- ----------------------------------------------------------------------------
create type app_role_v2 as enum ('admin', 'du_head', 'tribe_lead', 'squad_lead', 'employee');

alter table profiles alter column role drop default;
alter table profiles alter column role type app_role_v2 using (
  case role::text
    when 'admin' then 'admin'
    when 'manager' then 'squad_lead'
    else 'employee'
  end
)::app_role_v2;
alter table profiles alter column role set default 'employee';
alter table profiles alter column role set not null;

drop type app_role;
alter type app_role_v2 rename to app_role;

-- ----------------------------------------------------------------------------
-- 4. Portée d'une exception : "team" -> "squad"
-- ----------------------------------------------------------------------------
alter type exception_scope rename value 'team' to 'squad';

-- ----------------------------------------------------------------------------
-- 5. Organizational units (DU) / Tribes / Squads
--    manager_id est ajouté sans contrainte de clé étrangère dans un premier
--    temps (profiles.squad_id n'existe pas encore) puis contraint plus bas.
-- ----------------------------------------------------------------------------
create table organizational_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid, -- Responsable DU
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table tribes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organizational_unit_id uuid not null references organizational_units (id),
  manager_id uuid, -- Tribe Lead
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tribe_id uuid not null references tribes (id),
  manager_id uuid, -- Squad Lead
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table profiles add column squad_id uuid references squads (id);
alter table company_exceptions add column squad_id uuid references squads (id);

alter table organizational_units add constraint organizational_units_manager_id_fkey foreign key (manager_id) references profiles (id);
alter table tribes add constraint tribes_manager_id_fkey foreign key (manager_id) references profiles (id);
alter table squads add constraint squads_manager_id_fkey foreign key (manager_id) references profiles (id);

create index idx_profiles_squad_id on profiles (squad_id);
create index idx_tribes_org_unit on tribes (organizational_unit_id);
create index idx_squads_tribe on squads (tribe_id);
create index idx_organizational_units_manager on organizational_units (manager_id);
create index idx_tribes_manager on tribes (manager_id);
create index idx_squads_manager on squads (manager_id);

-- ----------------------------------------------------------------------------
-- 6. Historique des rattachements — conserve l'ancien et le nouveau squad_id
--    lors d'un changement d'équipe (section 34 du cahier des charges), en
--    complément du journal d'audit générique.
-- ----------------------------------------------------------------------------
create table membership_changes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  previous_squad_id uuid references squads (id),
  new_squad_id uuid references squads (id),
  effective_date date not null default current_date,
  changed_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index idx_membership_changes_profile on membership_changes (profile_id);
