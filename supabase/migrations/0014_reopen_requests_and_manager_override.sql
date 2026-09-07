-- ============================================================================
-- Télétravail — trois évolutions complémentaires :
-- 1. Demande de modification d'une semaine déjà validée : véritable workflow
--    persistant (table dédiée), visible et actionnable directement depuis le
--    planning consolidé du manager (au lieu d'une simple notification perdue).
-- 2. Le manager peut saisir/ajuster le télétravail à la place d'un
--    collaborateur de son périmètre, y compris régulariser une semaine déjà
--    validée, puis "Enregistrer et valider" en une seule action.
-- 3. (Complétée côté application, pas de schéma dédié : voir rules-engine.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Demandes de réouverture — une vraie ligne persistante par demande,
--    plutôt qu'un simple événement de journal : le manager doit pouvoir la
--    retrouver et la trancher directement, pas seulement recevoir une
--    notification éphémère.
-- ----------------------------------------------------------------------------
create type reopen_request_status as enum ('pending', 'approved', 'rejected');

create table week_reopen_requests (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_plans (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  requested_by uuid references profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  reason text,
  status reopen_request_status not null default 'pending',
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now()
);

create index idx_week_reopen_requests_plan on week_reopen_requests (weekly_plan_id, created_at desc);
create index idx_week_reopen_requests_employee on week_reopen_requests (employee_id);

-- Une seule demande ACTIVE (en attente) par semaine — un double-clic du
-- collaborateur ne doit jamais créer de doublon exploitable par le manager.
create unique index uq_week_reopen_requests_pending on week_reopen_requests (weekly_plan_id) where status = 'pending';

alter table week_reopen_requests enable row level security;

create policy week_reopen_requests_select on week_reopen_requests for select
  using (public.is_self_or_privileged(employee_id));

-- Seul le collaborateur lui-même déclenche une demande (jamais un supérieur
-- "à sa place" : c'est une requête, pas une saisie).
create policy week_reopen_requests_insert on week_reopen_requests for insert
  with check (employee_id = auth.uid() and requested_by = auth.uid());

-- Le déclenchement passe par une simple insertion applicative (RLS ci-dessus
-- suffit) ; la décision, elle, doit être atomique avec la transition de la
-- semaine — elle passe par la fonction ci-dessous, appelée avec les droits de
-- l'appelant (security invoker) : `is_superior_of` y est donc évalué avec le
-- bon `auth.uid()`, et le déclenchement d'`weekly_plans_guard` reste soumis
-- aux mêmes règles que n'importe quelle autre décision manager.
create policy week_reopen_requests_update on week_reopen_requests for update
  using (public.is_superior_of(employee_id))
  with check (public.is_superior_of(employee_id));

create or replace function public.decide_reopen_request(p_request_id uuid, p_approve boolean, p_comment text)
returns week_reopen_requests
language plpgsql security invoker set search_path = public as $$
declare
  v_request week_reopen_requests;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_dates jsonb;
begin
  select role into v_actor_role from profiles where id = v_actor;

  update week_reopen_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_actor,
        decided_at = now(),
        decision_comment = p_comment
    where id = p_request_id and status = 'pending'
    returning * into v_request;

  if v_request.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  if p_approve then
    -- La version précédemment validée reste intacte dans l'historique
    -- (weekly_plan_versions n'est jamais réécrite) : seul le statut vivant
    -- de `weekly_plans` change, le collaborateur devra soumettre une
    -- nouvelle version pour re-déclencher une validation.
    update weekly_plans
      set status = 'needs_changes', decided_at = now(), decided_by = v_actor,
          manager_comment = coalesce(p_comment, 'Réouverture acceptée.')
      where id = v_request.weekly_plan_id and status = 'validated';

    select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates
      from telework_days where weekly_plan_id = v_request.weekly_plan_id;

    insert into weekly_plan_events (weekly_plan_id, event_type, actor_id, actor_role, status_before, status_after, days_before, days_after, comment)
      values (v_request.weekly_plan_id, 'reopen_approved', v_actor, v_actor_role, 'validated', 'needs_changes', v_dates, v_dates, p_comment);

    insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
      values (v_actor, 'week_reopen_approved', 'weekly_plan', v_request.weekly_plan_id::text, jsonb_build_object('status', 'validated'), jsonb_build_object('status', 'needs_changes'));
  else
    insert into weekly_plan_events (weekly_plan_id, event_type, actor_id, actor_role, comment)
      values (v_request.weekly_plan_id, 'reopen_rejected', v_actor, v_actor_role, p_comment);

    insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
      values (v_actor, 'week_reopen_rejected', 'weekly_plan', v_request.weekly_plan_id::text, jsonb_build_object('comment', p_comment));
  end if;

  return v_request;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Saisie manager sur une semaine déjà validée (régularisation) : le
--    collaborateur ne peut jamais toucher une semaine validée lui-même, mais
--    un supérieur doit pouvoir la corriger directement, jours + validation en
--    une seule fois — sans passer par un aller-retour "à modifier" visible.
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
          or (public.is_superior_of(wp.employee_id) and wp.status in ('draft', 'needs_changes', 'submitted', 'validated'))
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
          or (public.is_superior_of(wp.employee_id) and wp.status in ('draft', 'needs_changes', 'submitted', 'validated'))
        )
    )
  );

-- Un supérieur peut désormais valider directement depuis n'importe quel état
-- vivant (brouillon/à modifier/soumise/déjà validée — régularisation) : la
-- distinction "passer par soumise d'abord" n'a de sens que pour le
-- collaborateur, jamais pour un manager qui saisit lui-même à la place de
-- quelqu'un. `rejected` n'est jamais un statut réellement stocké sur
-- `weekly_plans` (seulement une décision de version) : ce raccourci ne
-- ressuscite donc jamais une semaine "refusée".
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
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status = 'draft' then
      return new;
    end if;
    raise exception 'Semaine verrouillée : modification impossible';
  end if;

  if public.is_superior_of(old.employee_id) then
    if new.status = 'validated' then
      return new;
    end if;
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status in ('rejected', 'needs_changes') then
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

-- Validation directe par un supérieur (brouillon/à modifier/soumise/déjà
-- validée -> validée), avec un nouveau numéro de version à chaque fois pour
-- ne jamais écraser silencieusement l'historique — même quand la semaine
-- était déjà validée (régularisation).
create or replace function public.manager_validate_week(p_plan_id uuid)
returns weekly_plans
language plpgsql security invoker set search_path = public as $$
declare
  v_plan weekly_plans;
  v_status_before plan_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_version_number int;
  v_version_id uuid;
  v_dates jsonb;
begin
  select status into v_status_before from weekly_plans where id = p_plan_id;
  if v_status_before is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  update weekly_plans
    set status = 'validated', decided_at = now(), decided_by = v_actor
    where id = p_plan_id
    returning * into v_plan;

  select role into v_actor_role from profiles where id = v_actor;
  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates
    from telework_days where weekly_plan_id = p_plan_id;

  select coalesce(max(version_number), 0) + 1 into v_version_number
    from weekly_plan_versions where weekly_plan_id = p_plan_id;
  insert into weekly_plan_versions (weekly_plan_id, version_number, submitted_by, decision, decided_at, decided_by)
    values (p_plan_id, v_version_number, v_actor, 'validated', now(), v_actor)
    returning id into v_version_id;
  insert into weekly_plan_version_days (version_id, work_date)
    select v_version_id, value from jsonb_array_elements_text(v_dates);

  insert into weekly_plan_events (weekly_plan_id, version_number, event_type, actor_id, actor_role, status_before, status_after, days_after)
    values (p_plan_id, v_version_number, 'manager_override', v_actor, v_actor_role, v_status_before, 'validated', v_dates);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_actor, 'week_manager_override', 'weekly_plan', p_plan_id::text, jsonb_build_object('status', v_status_before), jsonb_build_object('status', 'validated'));

  return v_plan;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Réconciliation automatique après ajout/modification d'une absence
--    (section 7-11 du cahier des charges "avant/après absence") : un jour de
--    télétravail déjà posé qu'une nouvelle absence rend invalide (veille,
--    reprise, ou le jour même) doit être retiré, jamais laissé en silence
--    dans une semaine devenue métier-impossible. `security definer` : le
--    créateur de l'absence peut être le collaborateur lui-même (self-service)
--    dont la semaine est déjà "soumise"/"validée" — un statut qu'il ne peut
--    normalement jamais modifier lui-même (`weekly_plans_guard`) ; c'est ici
--    une correction système, pas une édition manuelle, donc volontairement
--    hors de ce garde-fou — mais toujours vérifiée via `is_self_or_privileged`
--    pour ne jamais agir sur une semaine hors du périmètre de l'appelant.
-- ----------------------------------------------------------------------------
create or replace function public.reconcile_week_absence_conflict(p_plan_id uuid, p_invalid_dates text[])
returns weekly_plans
language plpgsql security definer set search_path = public as $$
declare
  v_plan weekly_plans;
  v_status_before plan_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_dates jsonb;
begin
  select * into v_plan from weekly_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  if not public.is_self_or_privileged(v_plan.employee_id) then
    raise exception 'Non autorisé';
  end if;

  if p_invalid_dates is null or array_length(p_invalid_dates, 1) is null then
    return v_plan;
  end if;

  delete from telework_days where weekly_plan_id = p_plan_id and work_date = any(p_invalid_dates::date[]);

  v_status_before := v_plan.status;
  select role into v_actor_role from profiles where id = v_actor;
  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates
    from telework_days where weekly_plan_id = p_plan_id;

  if v_status_before in ('submitted', 'validated') then
    update weekly_plans
      set status = 'needs_changes', decided_at = now(), decided_by = v_actor,
          manager_comment = 'Modification automatique : une absence rend un jour de télétravail déjà posé incompatible avec les règles.'
      where id = p_plan_id
      returning * into v_plan;
  end if;

  insert into weekly_plan_events (weekly_plan_id, event_type, actor_id, actor_role, status_before, status_after, days_after, comment)
    values (
      p_plan_id, 'absence_conflict_reopened', v_actor, v_actor_role, v_status_before, v_plan.status, v_dates,
      'Jour(s) retiré(s) automatiquement (veille/reprise d''absence) : ' || array_to_string(p_invalid_dates, ', ')
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      v_actor, 'week_absence_conflict', 'weekly_plan', p_plan_id::text,
      jsonb_build_object('status', v_status_before),
      jsonb_build_object('status', v_plan.status, 'removedDates', to_jsonb(p_invalid_dates))
    );

  return v_plan;
end;
$$;
