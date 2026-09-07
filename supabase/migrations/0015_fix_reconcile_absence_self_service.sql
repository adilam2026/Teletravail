-- ============================================================================
-- Correctif ciblé (post-0014, déjà appliquée en production) :
-- `reconcile_week_absence_conflict` ne parvenait pas à rouvrir une semaine
-- SOUMISE ou VALIDÉE quand l'auteur de l'absence est le collaborateur
-- lui-même (auto-service) — anomalie identifiée et signalée avant toute
-- nouvelle évolution, corrigée ici seule, sans toucher au reste du schéma.
--
-- CAUSE EXACTE : `reconcile_week_absence_conflict` est `security definer`,
-- ce qui change le rôle Postgres d'exécution mais NE change PAS la valeur de
-- `auth.uid()` (toujours celle de la session appelante réelle) et NE
-- désactive PAS le trigger `before update` `weekly_plans_guard` attaché à la
-- table `weekly_plans` — un trigger s'exécute pour toute UPDATE sur la
-- table, quel que soit le contexte de sécurité de la fonction qui l'a
-- déclenchée. Quand un collaborateur pose lui-même une absence qui invalide
-- un télétravail déjà posé sur une semaine SOUMISE ou VALIDÉE, la branche
-- "self" du trigger ne permettait aucune transition
-- soumise/validée -> needs_changes pour le propriétaire lui-même : elle
-- levait une exception, ce qui annulait toute la transaction du RPC (y
-- compris le retrait du jour de télétravail déjà effectué juste avant) — et
-- la couche applicative avale silencieusement cette erreur pour ne jamais
-- bloquer la création de l'absence elle-même. Résultat : le jour de
-- télétravail devenu invalide restait silencieusement en place.
-- (Le cas où l'absence est ajoutée par un manager ou un admin n'était PAS
-- affecté : la branche "supérieur"/"admin" du trigger autorise déjà cette
-- transition.)
--
-- SOLUTION RETENUE : un drapeau de session strictement transaction-local
-- (`set_config(..., is_local => true)`), positionné UNIQUEMENT à l'intérieur
-- de `reconcile_week_absence_conflict`, juste avant la seule mise à jour de
-- statut qu'elle doit effectuer, et portant l'id exact de la ligne traitée.
-- `weekly_plans_guard` n'autorise la transition soumise/validée ->
-- needs_changes pour le propriétaire que si ce drapeau correspond très
-- précisément à la ligne en cours de mise à jour. Aucune RPC exposée au
-- client ne permet de positionner ce drapeau soi-même (il n'existe aucun
-- moyen, via l'API applicative ou PostgREST, d'appeler `set_config`) : il ne
-- peut donc jamais servir de porte dérobée pour modifier librement une
-- semaine validée. `set_config(..., true)` est local à la transaction en
-- cours : il disparaît automatiquement au commit/rollback, jamais persistant,
-- jamais visible d'une autre session.
--
-- Ce correctif ne touche : ni les policies RLS (déjà correctes depuis 0014),
-- ni les autres branches de `weekly_plans_guard` (droits du collaborateur
-- sur une semaine éditable, droits d'un supérieur, admin), ni aucune règle
-- métier déjà validée. Il ajoute par ailleurs `days_before` à l'événement
-- d'historique (`weekly_plan_events`) déjà créé par cette fonction, pour que
-- l'ancienne valeur (jours avant retrait) soit elle aussi tracée à côté de
-- la nouvelle (déjà présente) — seul complément d'historisation, sans
-- changer la structure de la table (colonne déjà existante depuis 0012).
-- ============================================================================

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

    -- Réconciliation automatique après absence (jamais un contournement
    -- générique du verrou) : `reconcile_week_absence_conflict` est la seule
    -- fonction du schéma à positionner ce drapeau transaction-local, et
    -- uniquement pour la ligne qu'elle vient de traiter et pour cette seule
    -- transition. Aucune RPC/table exposée au client ne permet de le
    -- positionner soi-même — ce n'est donc pas un moyen pour un
    -- collaborateur de modifier une semaine validée à sa guise.
    if old.status in ('submitted', 'validated') and new.status = 'needs_changes'
       and coalesce(current_setting('app.reconcile_absence_plan_id', true), '') = old.id::text then
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

create or replace function public.reconcile_week_absence_conflict(p_plan_id uuid, p_invalid_dates text[])
returns weekly_plans
language plpgsql security definer set search_path = public as $$
declare
  v_plan weekly_plans;
  v_status_before plan_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_dates_before jsonb;
  v_dates_after jsonb;
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

  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates_before
    from telework_days where weekly_plan_id = p_plan_id;

  delete from telework_days where weekly_plan_id = p_plan_id and work_date = any(p_invalid_dates::date[]);

  v_status_before := v_plan.status;
  select role into v_actor_role from profiles where id = v_actor;
  select coalesce(jsonb_agg(work_date order by work_date), '[]'::jsonb) into v_dates_after
    from telework_days where weekly_plan_id = p_plan_id;

  if v_status_before in ('submitted', 'validated') then
    -- Drapeau transaction-local (cf. commentaire de `weekly_plans_guard`
    -- ci-dessus) : autorise CETTE transition précise sur CETTE ligne
    -- précise, même quand l'appelant est le collaborateur lui-même.
    -- `is_local => true` : disparaît automatiquement à la fin de la
    -- transaction, jamais persistant, jamais visible ailleurs.
    perform set_config('app.reconcile_absence_plan_id', p_plan_id::text, true);

    update weekly_plans
      set status = 'needs_changes', decided_at = now(), decided_by = v_actor,
          manager_comment = 'Modification automatique : une absence rend un jour de télétravail déjà posé incompatible avec les règles.'
      where id = p_plan_id
      returning * into v_plan;
  end if;

  insert into weekly_plan_events (weekly_plan_id, event_type, actor_id, actor_role, status_before, status_after, days_before, days_after, comment)
    values (
      p_plan_id, 'absence_conflict_reopened', v_actor, v_actor_role, v_status_before, v_plan.status, v_dates_before, v_dates_after,
      'Jour(s) retiré(s) automatiquement (veille/reprise d''absence) : ' || array_to_string(p_invalid_dates, ', ')
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      v_actor, 'week_absence_conflict', 'weekly_plan', p_plan_id::text,
      jsonb_build_object('status', v_status_before, 'days', v_dates_before),
      jsonb_build_object('status', v_plan.status, 'days', v_dates_after, 'removedDates', to_jsonb(p_invalid_dates))
    );

  return v_plan;
end;
$$;
