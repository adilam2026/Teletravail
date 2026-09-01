-- ============================================================================
-- Performance — chantier "sensation quasi instantanée" : les mutations
-- submit/recall/decide faisaient chacune 5 à 10 aller-retours réseau
-- séquentiels vers Supabase (update, puis insert version, puis select id,
-- puis insert jours de version, puis insert événement, puis insert audit
-- log, puis notification...), ce qui explique les ~10s/5s mesurés. Ces
-- fonctions regroupent chaque mutation en UNE seule transaction serveur,
-- appelée en UN seul aller-retour réseau — la logique métier (qui a le
-- droit de faire quoi, quelles transitions sont permises) reste portée par
-- les policies RLS et le trigger weekly_plans_guard existants : ces
-- fonctions sont SECURITY INVOKER (pas DEFINER), elles n'élargissent aucune
-- permission, elles économisent seulement les allers-retours réseau.
-- ============================================================================

create or replace function public.submit_week(p_plan_id uuid, p_selected_dates date[])
returns weekly_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan weekly_plans;
  v_status_before plan_status;
  v_actor_id uuid := auth.uid();
  v_actor_role app_role;
  v_version_number int;
  v_version_id uuid;
begin
  select status into v_status_before from weekly_plans where id = p_plan_id;

  update weekly_plans
    set status = 'submitted', submitted_at = now()
    where id = p_plan_id and status in ('draft', 'needs_changes')
    returning * into v_plan;

  if v_plan.id is null then
    -- PostgREST sérialise un `return null;` sur un type composite en objet
    -- JSON à tous les champs nuls, pas en JSON `null` — un piège qui rend
    -- `!data` faux côté client (objet non nul). On lève une exception
    -- nommée à la place : `data` reste alors un vrai `null` et `error`
    -- porte ce message précis, sans ambiguïté.
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor_id;

  select coalesce(max(version_number), 0) + 1 into v_version_number
    from weekly_plan_versions where weekly_plan_id = p_plan_id;

  insert into weekly_plan_versions (weekly_plan_id, version_number, submitted_by)
    values (p_plan_id, v_version_number, v_actor_id)
    returning id into v_version_id;

  if p_selected_dates is not null and array_length(p_selected_dates, 1) > 0 then
    insert into weekly_plan_version_days (version_id, work_date)
      select v_version_id, d from unnest(p_selected_dates) as d;
  end if;

  insert into weekly_plan_events (weekly_plan_id, version_number, event_type, actor_id, actor_role, status_before, status_after, days_after)
    values (
      p_plan_id, v_version_number,
      case when v_version_number = 1 then 'submitted' else 'resubmitted' end,
      v_actor_id, v_actor_role, v_status_before, 'submitted', to_jsonb(p_selected_dates)
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (
      v_actor_id, 'week_submitted', 'weekly_plan', p_plan_id::text,
      jsonb_build_object('status', 'submitted', 'selectedDates', to_jsonb(p_selected_dates), 'versionNumber', v_version_number, 'submittedBy', v_actor_id)
    );

  return v_plan;
end;
$$;

create or replace function public.recall_week(p_plan_id uuid)
returns weekly_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan weekly_plans;
  v_actor_id uuid := auth.uid();
  v_actor_role app_role;
  v_dates jsonb;
begin
  update weekly_plans
    set status = 'draft', submitted_at = null
    where id = p_plan_id and employee_id = v_actor_id and status = 'submitted'
    returning * into v_plan;

  if v_plan.id is null then
    -- PostgREST sérialise un `return null;` sur un type composite en objet
    -- JSON à tous les champs nuls, pas en JSON `null` — un piège qui rend
    -- `!data` faux côté client (objet non nul). On lève une exception
    -- nommée à la place : `data` reste alors un vrai `null` et `error`
    -- porte ce message précis, sans ambiguïté.
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor_id;
  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates
    from telework_days where weekly_plan_id = p_plan_id;

  insert into weekly_plan_events (weekly_plan_id, event_type, actor_id, actor_role, status_before, status_after, days_before, days_after)
    values (p_plan_id, 'recalled', v_actor_id, v_actor_role, 'submitted', 'draft', v_dates, v_dates);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_actor_id, 'week_recalled', 'weekly_plan', p_plan_id::text, jsonb_build_object('status', 'submitted'), jsonb_build_object('status', 'draft'));

  return v_plan;
end;
$$;

create or replace function public.decide_week(p_plan_id uuid, p_decision weekly_plan_version_decision, p_comment text)
returns weekly_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan weekly_plans;
  v_next_status plan_status;
  v_actor_id uuid := auth.uid();
  v_actor_role app_role;
  v_version_id uuid;
  v_version_number int;
  v_dates jsonb;
begin
  v_next_status := case when p_decision = 'validated' then 'validated'::plan_status else 'needs_changes'::plan_status end;

  update weekly_plans
    set status = v_next_status, decided_at = now(), decided_by = v_actor_id, manager_comment = p_comment
    where id = p_plan_id and status = 'submitted'
    returning * into v_plan;

  if v_plan.id is null then
    -- PostgREST sérialise un `return null;` sur un type composite en objet
    -- JSON à tous les champs nuls, pas en JSON `null` — un piège qui rend
    -- `!data` faux côté client (objet non nul). On lève une exception
    -- nommée à la place : `data` reste alors un vrai `null` et `error`
    -- porte ce message précis, sans ambiguïté.
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor_id;

  select id, version_number into v_version_id, v_version_number
    from weekly_plan_versions where weekly_plan_id = p_plan_id order by version_number desc limit 1;

  if v_version_id is not null then
    update weekly_plan_versions
      set decision = p_decision, decided_at = now(), decided_by = v_actor_id, comment = p_comment
      where id = v_version_id;
  end if;

  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates
    from telework_days where weekly_plan_id = p_plan_id;

  insert into weekly_plan_events (weekly_plan_id, version_number, event_type, actor_id, actor_role, status_before, status_after, days_before, days_after, comment)
    values (
      p_plan_id, v_version_number,
      case p_decision when 'validated' then 'validated' when 'rejected' then 'rejected' else 'changes_requested' end,
      v_actor_id, v_actor_role, 'submitted', v_next_status, v_dates, v_dates, p_comment
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      v_actor_id, 'week_' || p_decision::text, 'weekly_plan', p_plan_id::text,
      jsonb_build_object('status', 'submitted'),
      jsonb_build_object('status', v_next_status, 'comment', p_comment)
    );

  return v_plan;
end;
$$;

-- ----------------------------------------------------------------------------
-- Index manquant identifié par l'audit perf : le badge "à valider" de la
-- sidebar (countPendingValidations) filtre status='submitted' puis
-- employee_id IN (...) à chaque navigation d'un manager — un composite
-- (status, employee_id) sert cette requête directement par index au lieu
-- d'un scan filtré sur idx_weekly_plans_status seul.
-- ----------------------------------------------------------------------------
create index if not exists idx_weekly_plans_status_employee on weekly_plans (status, employee_id);
