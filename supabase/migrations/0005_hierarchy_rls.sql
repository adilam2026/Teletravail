-- ============================================================================
-- Télétravail — RLS hiérarchique (DU / Tribe / Squad / Collaborateur)
-- ============================================================================
-- Principe : la visibilité (SELECT) remonte toute la ligne hiérarchique
-- (un DU Head voit tout son périmètre), tandis que le droit de VALIDER une
-- semaine reste strictement réservé au validateur direct (section 19) —
-- un Tribe Lead ne valide pas la semaine d'un simple collaborateur, c'est le
-- rôle du Squad Lead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonctions utilitaires
-- ----------------------------------------------------------------------------
create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function public.role_rank(r app_role) returns int
language sql immutable as $$
  select case r
    when 'admin' then 100
    when 'du_head' then 40
    when 'tribe_lead' then 30
    when 'squad_lead' then 20
    when 'employee' then 10
  end;
$$;

-- Portée effective d'un profil, qu'il soit MEMBRE (collaborateur) ou
-- RESPONSABLE (squad/tribe/DU lead) d'une unité — une seule fonction gère
-- les 4 niveaux plutôt que de dupliquer la logique par rôle.
create or replace function public.profile_scope(p_id uuid)
returns table(squad_id uuid, tribe_id uuid, du_id uuid)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      p.id,
      coalesce(p.squad_id, led_sq.id) as squad_id,
      coalesce(sq.tribe_id, led_sq.tribe_id, led_tr.id) as tribe_id
    from profiles p
    left join squads sq on sq.id = p.squad_id
    left join squads led_sq on led_sq.manager_id = p.id
    left join tribes led_tr on led_tr.manager_id = p.id
    where p.id = p_id
  )
  select
    base.squad_id,
    base.tribe_id,
    coalesce(t.organizational_unit_id, led_du.id) as du_id
  from base
  left join tribes t on t.id = base.tribe_id
  left join organizational_units led_du on led_du.manager_id = base.id;
$$;

create or replace function public.is_squad_lead_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squads s
    join profile_scope(target) ps on ps.squad_id = s.id
    where s.manager_id = auth.uid()
  );
$$;

create or replace function public.is_tribe_lead_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tribes t
    join profile_scope(target) ps on ps.tribe_id = t.id
    where t.manager_id = auth.uid()
  );
$$;

create or replace function public.is_du_head_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organizational_units o
    join profile_scope(target) ps on ps.du_id = o.id
    where o.manager_id = auth.uid()
  );
$$;

-- Visibilité large : n'importe quel supérieur de la ligne hiérarchique (ou admin)
create or replace function public.is_superior_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_squad_lead_of(target)
    or public.is_tribe_lead_of(target)
    or public.is_du_head_of(target);
$$;

create or replace function public.is_self_or_privileged(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid() or public.is_superior_of(target);
$$;

-- Validateur DIRECT (celui qui a le droit de trancher une semaine soumise) :
-- Collaborateur -> Squad Lead, Squad Lead -> Tribe Lead, Tribe Lead -> DU Head,
-- DU Head -> Admin (ou auto-validation gérée au niveau applicatif).
create or replace function public.is_direct_validator_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case (select role from profiles where id = target)
    when 'employee' then public.is_squad_lead_of(target)
    when 'squad_lead' then public.is_tribe_lead_of(target)
    when 'tribe_lead' then public.is_du_head_of(target)
    when 'du_head' then public.is_admin()
    else public.is_admin()
  end;
$$;

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

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or public.is_superior_of(id));

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  with check (
    public.is_admin() or public.role_rank(role) < public.role_rank(public.current_role())
  );

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or public.is_superior_of(id))
  with check (id = auth.uid() or public.is_superior_of(id));

create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.role <> old.role
      or new.squad_id is distinct from old.squad_id
      or new.employee_type is distinct from old.employee_type
      or new.status <> old.status
      or new.login <> old.login then
      raise exception 'Modification non autorisée sur votre propre profil';
    end if;
    return new;
  end if;

  if public.is_superior_of(old.id) then
    if public.role_rank(new.role) >= public.role_rank(public.current_role()) then
      raise exception 'Impossible d''attribuer un rôle égal ou supérieur au vôtre';
    end if;
    return new;
  end if;

  raise exception 'Non autorisé';
end;
$$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard before update on profiles
  for each row execute function public.profiles_guard();

-- ----------------------------------------------------------------------------
-- organizational_units / tribes / squads
-- ----------------------------------------------------------------------------
alter table organizational_units enable row level security;
drop policy if exists organizational_units_select on organizational_units;
create policy organizational_units_select on organizational_units for select
  using (
    public.is_admin()
    or manager_id = auth.uid()
    or id in (select du_id from public.profile_scope(auth.uid()))
  );
drop policy if exists organizational_units_write on organizational_units;
create policy organizational_units_write on organizational_units for all
  using (public.is_admin()) with check (public.is_admin());

alter table tribes enable row level security;
drop policy if exists tribes_select on tribes;
create policy tribes_select on tribes for select
  using (
    public.is_admin()
    or manager_id = auth.uid()
    or exists (select 1 from organizational_units o where o.id = tribes.organizational_unit_id and o.manager_id = auth.uid())
    or id in (select tribe_id from public.profile_scope(auth.uid()))
  );
drop policy if exists tribes_write on tribes;
create policy tribes_write on tribes for all
  using (public.is_admin() or exists (select 1 from organizational_units o where o.id = tribes.organizational_unit_id and o.manager_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from organizational_units o where o.id = tribes.organizational_unit_id and o.manager_id = auth.uid()));

alter table squads enable row level security;
drop policy if exists squads_select on squads;
create policy squads_select on squads for select
  using (
    public.is_admin()
    or manager_id = auth.uid()
    or exists (select 1 from tribes t where t.id = squads.tribe_id and (t.manager_id = auth.uid() or exists (select 1 from organizational_units o where o.id = t.organizational_unit_id and o.manager_id = auth.uid())))
    or id in (select squad_id from public.profile_scope(auth.uid()))
  );
drop policy if exists squads_write on squads;
create policy squads_write on squads for all
  using (
    public.is_admin()
    or exists (select 1 from tribes t where t.id = squads.tribe_id and (t.manager_id = auth.uid() or exists (select 1 from organizational_units o where o.id = t.organizational_unit_id and o.manager_id = auth.uid())))
  )
  with check (
    public.is_admin()
    or exists (select 1 from tribes t where t.id = squads.tribe_id and (t.manager_id = auth.uid() or exists (select 1 from organizational_units o where o.id = t.organizational_unit_id and o.manager_id = auth.uid())))
  );

alter table membership_changes enable row level security;
drop policy if exists membership_changes_select on membership_changes;
create policy membership_changes_select on membership_changes for select
  using (public.is_admin() or profile_id = auth.uid() or public.is_superior_of(profile_id));
drop policy if exists membership_changes_insert on membership_changes;
create policy membership_changes_insert on membership_changes for insert
  with check (public.is_admin() or public.is_superior_of(profile_id));

-- ----------------------------------------------------------------------------
-- weekly_plans
-- ----------------------------------------------------------------------------
alter table weekly_plans enable row level security;

drop policy if exists weekly_plans_select on weekly_plans;
create policy weekly_plans_select on weekly_plans for select
  using (public.is_self_or_privileged(employee_id));

drop policy if exists weekly_plans_insert on weekly_plans;
create policy weekly_plans_insert on weekly_plans for insert
  with check (employee_id = auth.uid() or public.is_admin());

drop policy if exists weekly_plans_update on weekly_plans;
create policy weekly_plans_update on weekly_plans for update
  using (public.is_self_or_privileged(employee_id))
  with check (public.is_self_or_privileged(employee_id));

drop policy if exists weekly_plans_delete on weekly_plans;
create policy weekly_plans_delete on weekly_plans for delete
  using (public.is_admin());

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
    if old.status not in ('draft', 'needs_changes') then
      raise exception 'Semaine verrouillée : modification impossible';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'Transition de statut non autorisée';
    end if;
    return new;
  end if;

  if public.is_direct_validator_of(old.employee_id) then
    if old.status = 'submitted' and new.status in ('validated', 'rejected', 'needs_changes') then
      return new;
    end if;
    if old.status = 'validated' and new.status = 'needs_changes' then
      return new;
    end if;
    raise exception 'Transition de statut non autorisée';
  end if;

  raise exception 'Non autorisé : seul le validateur direct peut décider de cette semaine';
end;
$$;

drop trigger if exists trg_weekly_plans_guard on weekly_plans;
create trigger trg_weekly_plans_guard before update on weekly_plans
  for each row execute function public.weekly_plans_guard();

-- ----------------------------------------------------------------------------
-- telework_days
-- ----------------------------------------------------------------------------
alter table telework_days enable row level security;

drop policy if exists telework_days_select on telework_days;
create policy telework_days_select on telework_days for select
  using (
    exists (
      select 1 from weekly_plans wp
      where wp.id = weekly_plan_id and public.is_self_or_privileged(wp.employee_id)
    )
  );

drop policy if exists telework_days_insert on telework_days;
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

drop policy if exists telework_days_delete on telework_days;
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
-- absences (le self-service collaborateur est ajouté en 0006)
-- ----------------------------------------------------------------------------
alter table absences enable row level security;

drop policy if exists absences_select on absences;
create policy absences_select on absences for select
  using (public.is_self_or_privileged(employee_id));

drop policy if exists absences_insert on absences;
create policy absences_insert on absences for insert
  with check (public.is_admin() or public.is_superior_of(employee_id));

drop policy if exists absences_update on absences;
create policy absences_update on absences for update
  using (public.is_admin() or public.is_superior_of(employee_id))
  with check (public.is_admin() or public.is_superior_of(employee_id));

drop policy if exists absences_delete on absences;
create policy absences_delete on absences for delete
  using (public.is_admin() or public.is_superior_of(employee_id));

-- ----------------------------------------------------------------------------
-- référentiels lus par tous les utilisateurs connectés, écrits par l'admin
-- ----------------------------------------------------------------------------
alter table absence_types enable row level security;
drop policy if exists absence_types_select on absence_types;
create policy absence_types_select on absence_types for select using (auth.uid() is not null);
drop policy if exists absence_types_write on absence_types;
create policy absence_types_write on absence_types for all
  using (public.is_admin()) with check (public.is_admin());

alter table public_holidays enable row level security;
drop policy if exists public_holidays_select on public_holidays;
create policy public_holidays_select on public_holidays for select using (auth.uid() is not null);
drop policy if exists public_holidays_write on public_holidays;
create policy public_holidays_write on public_holidays for all
  using (public.is_admin()) with check (public.is_admin());

alter table company_exceptions enable row level security;
drop policy if exists company_exceptions_select on company_exceptions;
create policy company_exceptions_select on company_exceptions for select using (auth.uid() is not null);
drop policy if exists company_exceptions_write on company_exceptions;
create policy company_exceptions_write on company_exceptions for all
  using (public.is_admin()) with check (public.is_admin());

alter table telework_rules enable row level security;
drop policy if exists telework_rules_select on telework_rules;
create policy telework_rules_select on telework_rules for select using (auth.uid() is not null);
drop policy if exists telework_rules_write on telework_rules;
create policy telework_rules_write on telework_rules for all
  using (public.is_admin()) with check (public.is_admin());

alter table app_settings enable row level security;
drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select using (auth.uid() is not null);
drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings for all
  using (public.is_admin()) with check (public.is_admin());

alter table rule_overrides enable row level security;
drop policy if exists rule_overrides_select on rule_overrides;
create policy rule_overrides_select on rule_overrides for select
  using (public.is_self_or_privileged(employee_id));
drop policy if exists rule_overrides_write on rule_overrides;
create policy rule_overrides_write on rule_overrides for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
alter table notifications enable row level security;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (recipient_id = auth.uid());

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- audit_logs — journal immuable (pas d'update/delete)
-- ----------------------------------------------------------------------------
alter table audit_logs enable row level security;

drop policy if exists audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs for select
  using (
    public.is_admin()
    or actor_id = auth.uid()
    or (
      entity_type = 'weekly_plan'
      and exists (
        select 1 from weekly_plans wp
        where wp.id::text = entity_id and public.is_self_or_privileged(wp.employee_id)
      )
    )
    or (entity_type = 'profile' and entity_id is not null and public.is_superior_of(entity_id::uuid))
  );

drop policy if exists audit_logs_insert on audit_logs;
create policy audit_logs_insert on audit_logs for insert
  with check (actor_id = auth.uid() or public.is_admin());
