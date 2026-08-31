-- ============================================================================
-- Télétravail — cycle de vie complet d'une semaine : rappel, versions,
-- historique structuré, saisie manager pour un rattaché.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. weekly_plans_guard() — corrige le rappel (bloqué à tort) et ajoute les
--    transitions autorisées pour un supérieur qui prépare/ajuste/décide la
--    semaine d'un rattaché.
-- ----------------------------------------------------------------------------
create or replace function public.weekly_plans_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.employee_id <> old.employee_id or new.week_start <> old.week_start then
    raise exception 'Champs non modifiables';
  end if;

  if old.employee_id = auth.uid() then
    -- Le collaborateur édite un brouillon/à-modifier, le soumet, ou rappelle
    -- sa propre demande tant qu'elle n'a pas été décidée (submitted -> draft).
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status = 'draft' then
      return new;
    end if;
    raise exception 'Semaine verrouillée : modification impossible';
  end if;

  if public.is_superior_of(old.employee_id) then
    -- Un supérieur peut préparer/ajuster une semaine (mêmes transitions que
    -- le collaborateur), décider d'une semaine soumise, ou rouvrir une
    -- semaine déjà validée. Il ne rappelle jamais à la place du
    -- collaborateur (submitted -> draft reste un privilège du propriétaire).
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status in ('validated', 'rejected', 'needs_changes') then
      return new;
    end if;
    if old.status = 'validated' and new.status = 'needs_changes' then
      return new;
    end if;
    raise exception 'Transition de statut non autorisée';
  end if;

  raise exception 'Non autorisé';
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. weekly_plans — un supérieur peut créer la toute première ligne (brouillon)
--    de la semaine d'un rattaché, pas seulement l'intéressé ou l'admin.
-- ----------------------------------------------------------------------------
drop policy if exists weekly_plans_insert on weekly_plans;
create policy weekly_plans_insert on weekly_plans for insert
  with check (employee_id = auth.uid() or public.is_admin() or public.is_superior_of(employee_id));

-- ----------------------------------------------------------------------------
-- 3. telework_days — un supérieur peut ajouter/retirer des jours pour un
--    rattaché en brouillon/à-modifier (préparation) ou même une fois soumise
--    (ajustement avant décision, historisé séparément) ; le collaborateur
--    garde son périmètre inchangé (jamais sur une semaine déjà soumise —
--    il doit d'abord la rappeler).
-- ----------------------------------------------------------------------------
drop policy if exists telework_days_insert on telework_days;
create policy telework_days_insert on telework_days for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id
        and (
          (wp.employee_id = auth.uid() and wp.status in ('draft', 'needs_changes'))
          or (public.is_superior_of(wp.employee_id) and wp.status in ('draft', 'needs_changes', 'submitted'))
        )
    )
  );

drop policy if exists telework_days_delete on telework_days;
create policy telework_days_delete on telework_days for delete
  using (
    public.is_admin()
    or exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id
        and (
          (wp.employee_id = auth.uid() and wp.status in ('draft', 'needs_changes'))
          or (public.is_superior_of(wp.employee_id) and wp.status in ('draft', 'needs_changes', 'submitted'))
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Versions — chaque cycle soumission -> décision est une ligne distincte,
--    jamais écrasée. `weekly_plans` reste la "semaine logique" (un pointeur
--    vers l'état courant, inchangé dans sa forme actuelle).
-- ----------------------------------------------------------------------------
create type weekly_plan_version_decision as enum ('validated', 'rejected', 'changes_requested');

create table weekly_plan_versions (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_plans (id) on delete cascade,
  version_number int not null,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references profiles (id),
  decision weekly_plan_version_decision,
  decided_at timestamptz,
  decided_by uuid references profiles (id),
  comment text,
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, version_number)
);

create index idx_weekly_plan_versions_plan on weekly_plan_versions (weekly_plan_id, version_number desc);

create table weekly_plan_version_days (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references weekly_plan_versions (id) on delete cascade,
  work_date date not null,
  unique (version_id, work_date)
);

create index idx_weekly_plan_version_days_version on weekly_plan_version_days (version_id);

alter table weekly_plan_versions enable row level security;

create policy weekly_plan_versions_select on weekly_plan_versions for select
  using (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)));

create policy weekly_plan_versions_insert on weekly_plan_versions for insert
  with check (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)));

-- Seul un supérieur enregistre une décision (met à jour la ligne existante).
create policy weekly_plan_versions_update on weekly_plan_versions for update
  using (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_superior_of(wp.employee_id)))
  with check (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_superior_of(wp.employee_id)));

alter table weekly_plan_version_days enable row level security;

create policy weekly_plan_version_days_select on weekly_plan_version_days for select
  using (
    exists (
      select 1 from weekly_plan_versions v
      join weekly_plans wp on wp.id = v.weekly_plan_id
      where v.id = version_id and public.is_self_or_privileged(wp.employee_id)
    )
  );

create policy weekly_plan_version_days_insert on weekly_plan_version_days for insert
  with check (
    exists (
      select 1 from weekly_plan_versions v
      join weekly_plans wp on wp.id = v.weekly_plan_id
      where v.id = version_id and public.is_self_or_privileged(wp.employee_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Événements — journal détaillé du cycle de vie, distinct de `audit_logs`
--    (générique) : dédié à la reconstruction de la timeline d'une semaine,
--    avec l'état des jours avant/après pour chaque action.
-- ----------------------------------------------------------------------------
create table weekly_plan_events (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_plans (id) on delete cascade,
  version_number int,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references profiles (id),
  actor_role app_role,
  status_before plan_status,
  status_after plan_status,
  days_before jsonb,
  days_after jsonb,
  comment text
);

create index idx_weekly_plan_events_plan on weekly_plan_events (weekly_plan_id, occurred_at);

alter table weekly_plan_events enable row level security;

create policy weekly_plan_events_select on weekly_plan_events for select
  using (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)));

create policy weekly_plan_events_insert on weekly_plan_events for insert
  with check (exists (select 1 from weekly_plans wp where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)));
