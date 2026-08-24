-- ============================================================================
-- Télétravail — Row Level Security
-- ============================================================================
-- Principe : les policies sont la barrière de sécurité réelle. L'UI masque
-- des écrans par confort, mais toute lecture/écriture est revalidée ici.
-- Les fonctions "security definer" évitent la récursion RLS quand une policy
-- sur `profiles` a besoin de relire `profiles`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonctions utilitaires (security definer, exécutées avec les droits du
-- propriétaire pour court-circuiter RLS lors de la vérification des rôles)
-- ----------------------------------------------------------------------------
create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function public.current_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid();
$$;

create or replace function public.managed_team_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from teams where manager_id = auth.uid();
$$;

-- true si `target` fait partie d'une équipe gérée par l'utilisateur courant
create or replace function public.is_manager_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join teams t on t.id = p.team_id
    where p.id = target and t.manager_id = auth.uid()
  );
$$;

create or replace function public.is_self_or_privileged(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid() or public.is_admin() or public.is_manager_of(target);
$$;

-- insertion de notification en contournant RLS (appelée depuis les server actions)
create or replace function public.create_notification(
  p_recipient_id uuid, p_type text, p_title text, p_body text,
  p_related_entity_type text default null, p_related_entity_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
  values (p_recipient_id, p_type, p_title, p_body, p_related_entity_type, p_related_entity_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select on profiles for select
  using (id = auth.uid() or public.is_admin() or public.is_manager_of(id));

create policy profiles_insert on profiles for insert
  with check (
    public.is_admin()
    or (
      public.current_role() = 'manager'
      and role = 'employee'
      and team_id in (select id from teams where manager_id = auth.uid())
    )
  );

create policy profiles_update on profiles for update
  using (id = auth.uid() or public.is_admin() or public.is_manager_of(id))
  with check (id = auth.uid() or public.is_admin() or public.is_manager_of(id));

-- Garde-fou : un non-admin ne peut pas s'auto-élever ni sortir du périmètre
-- de son équipe, quelle que soit la policy ci-dessus.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acting_role app_role;
begin
  select role into acting_role from profiles where id = auth.uid();

  if acting_role = 'admin' then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.role <> old.role
      or new.team_id is distinct from old.team_id
      or new.manager_id is distinct from old.manager_id
      or new.employee_type is distinct from old.employee_type
      or new.status <> old.status
      or new.login <> old.login then
      raise exception 'Modification non autorisée sur votre propre profil';
    end if;
    return new;
  end if;

  if acting_role = 'manager' and public.is_manager_of(old.id) then
    if new.role <> old.role then
      raise exception 'Un manager ne peut pas modifier le rôle applicatif';
    end if;
    if new.team_id is distinct from old.team_id
       and new.team_id not in (select id from teams where manager_id = auth.uid()) then
      raise exception 'Équipe hors de votre périmètre';
    end if;
    return new;
  end if;

  raise exception 'Non autorisé';
end;
$$;

create trigger trg_profiles_guard before update on profiles
  for each row execute function public.profiles_guard();

-- ----------------------------------------------------------------------------
-- teams
-- ----------------------------------------------------------------------------
alter table teams enable row level security;

create policy teams_select on teams for select
  using (public.is_admin() or manager_id = auth.uid() or id = public.current_team_id());

create policy teams_write on teams for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- rule_overrides
-- ----------------------------------------------------------------------------
alter table rule_overrides enable row level security;

create policy rule_overrides_select on rule_overrides for select
  using (public.is_self_or_privileged(employee_id));

create policy rule_overrides_write on rule_overrides for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- weekly_plans
-- ----------------------------------------------------------------------------
alter table weekly_plans enable row level security;

create policy weekly_plans_select on weekly_plans for select
  using (public.is_self_or_privileged(employee_id));

create policy weekly_plans_insert on weekly_plans for insert
  with check (employee_id = auth.uid() or public.is_admin());

create policy weekly_plans_update on weekly_plans for update
  using (public.is_self_or_privileged(employee_id))
  with check (public.is_self_or_privileged(employee_id));

create policy weekly_plans_delete on weekly_plans for delete
  using (public.is_admin());

create or replace function public.weekly_plans_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acting_role app_role;
begin
  select role into acting_role from profiles where id = auth.uid();

  if acting_role = 'admin' then
    return new;
  end if;

  if new.employee_id <> old.employee_id or new.week_start <> old.week_start then
    raise exception 'Champs non modifiables';
  end if;

  if old.employee_id = auth.uid() then
    if old.status not in ('draft', 'needs_changes') then
      raise exception 'Semaine verrouillée : modification impossible';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'Transition de statut non autorisée';
    end if;
    return new;
  end if;

  if public.is_manager_of(old.employee_id) then
    if old.status = 'submitted' and new.status in ('validated', 'rejected', 'needs_changes') then
      return new;
    end if;
    -- Réouverture d'une semaine déjà validée, à la demande du collaborateur.
    if old.status = 'validated' and new.status = 'needs_changes' then
      return new;
    end if;
    raise exception 'Transition de statut non autorisée pour un manager';
  end if;

  raise exception 'Non autorisé';
end;
$$;

create trigger trg_weekly_plans_guard before update on weekly_plans
  for each row execute function public.weekly_plans_guard();

-- ----------------------------------------------------------------------------
-- telework_days — modifiables uniquement tant que le plan est en brouillon
-- ----------------------------------------------------------------------------
alter table telework_days enable row level security;

create policy telework_days_select on telework_days for select
  using (
    exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)
    )
  );

create policy telework_days_insert on telework_days for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id
        and wp.employee_id = auth.uid()
        and wp.status in ('draft', 'needs_changes')
    )
  );

create policy telework_days_delete on telework_days for delete
  using (
    public.is_admin()
    or exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id
        and wp.employee_id = auth.uid()
        and wp.status in ('draft', 'needs_changes')
    )
  );

-- ----------------------------------------------------------------------------
-- absences
-- ----------------------------------------------------------------------------
alter table absences enable row level security;

create policy absences_select on absences for select
  using (public.is_self_or_privileged(employee_id));

create policy absences_insert on absences for insert
  with check (public.is_admin() or public.is_manager_of(employee_id));

create policy absences_update on absences for update
  using (public.is_admin() or public.is_manager_of(employee_id))
  with check (public.is_admin() or public.is_manager_of(employee_id));

create policy absences_delete on absences for delete
  using (public.is_admin() or public.is_manager_of(employee_id));

-- ----------------------------------------------------------------------------
-- référentiels lus par tous les utilisateurs connectés, écrits par l'admin
-- ----------------------------------------------------------------------------
alter table absence_types enable row level security;
create policy absence_types_select on absence_types for select using (auth.uid() is not null);
create policy absence_types_write on absence_types for all
  using (public.is_admin()) with check (public.is_admin());

alter table public_holidays enable row level security;
create policy public_holidays_select on public_holidays for select using (auth.uid() is not null);
create policy public_holidays_write on public_holidays for all
  using (public.is_admin()) with check (public.is_admin());

alter table company_exceptions enable row level security;
create policy company_exceptions_select on company_exceptions for select using (auth.uid() is not null);
create policy company_exceptions_write on company_exceptions for all
  using (public.is_admin()) with check (public.is_admin());

alter table telework_rules enable row level security;
create policy telework_rules_select on telework_rules for select using (auth.uid() is not null);
create policy telework_rules_write on telework_rules for all
  using (public.is_admin()) with check (public.is_admin());

alter table app_settings enable row level security;
create policy app_settings_select on app_settings for select using (auth.uid() is not null);
create policy app_settings_write on app_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- notifications — chacun ne voit/marque que les siennes ; les insertions
-- passent exclusivement par create_notification() ou le rôle service.
-- ----------------------------------------------------------------------------
alter table notifications enable row level security;

create policy notifications_select on notifications for select
  using (recipient_id = auth.uid());

create policy notifications_update on notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- audit_logs — journal immuable (pas d'update/delete)
-- ----------------------------------------------------------------------------
alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs for select
  using (
    public.is_admin()
    or actor_id = auth.uid()
    or (
      entity_type = 'weekly_plan'
      and exists (
        select 1 from weekly_plans wp
        where wp.id::text = entity_id
          and (wp.employee_id = auth.uid() or public.is_manager_of(wp.employee_id))
      )
    )
  );

create policy audit_logs_insert on audit_logs for insert
  with check (actor_id = auth.uid() or public.is_admin());
