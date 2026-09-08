-- ============================================================================
-- Workflow avancé des congés/absences.
--
-- CONSTAT (section 31 du cahier des charges "avant de coder") : la table
-- `absences` n'a aujourd'hui AUCUNE notion de statut — une absence créée est
-- immédiatement "confirmée" (voir l'UI "Mes absences", qui affiche
-- littéralement "✓ Confirmée" pour toute ligne). Ce lot introduit donc un
-- vrai cycle de vie (brouillon → soumise → validée / à modifier → validée,
-- plus réouverture/annulation d'une absence déjà validée), en réutilisant
-- fidèlement l'architecture déjà en place pour `weekly_plans` (mêmes noms de
-- colonnes génériques `decided_at/decided_by/manager_comment`, mêmes tables
-- `*_versions`/`*_events`, même table de demande de réouverture que
-- `week_reopen_requests`, même trigger-garde `security definer` couplé à des
-- policies RLS `is_self_or_privileged`/`is_superior_of`) — aucune structure
-- nouvelle n'est inventée.
--
-- Ce lot retire aussi l'ancien trigger `trg_remove_telework_on_absence`
-- (0006) : il supprimait silencieusement, sans aucune trace, un télétravail
-- recoupant une absence. Il est désormais strictement redondant avec
-- `reconcileWeeksForAbsence`/`reconcile_week_absence_conflict` (0014/0015,
-- non modifiés ici), qui couvre exactement le même cas ("jour d'absence
-- jamais sélectionnable", déjà vérifié par les tests du moteur de règles)
-- en plus de la veille/reprise, de façon historisée et sécurisée. Conserver
-- les deux aurait signifié deux moteurs parallèles pour le même problème.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Statut, versions, événements — même principe que weekly_plans.
-- ----------------------------------------------------------------------------
create type absence_status as enum ('draft', 'submitted', 'validated', 'needs_changes', 'cancelled');
create type absence_version_decision as enum ('validated', 'changes_requested');
create type absence_request_kind as enum ('modification', 'cancellation');

alter table absences
  add column status absence_status not null default 'validated',
  add column submitted_at timestamptz,
  add column decided_at timestamptz,
  add column decided_by uuid references profiles (id),
  add column manager_comment text;

-- Les lignes déjà existantes n'ont jamais connu de workflow : elles sont
-- déjà "confirmées" dans l'UI actuelle, le défaut ci-dessus (`validated`)
-- les couvre correctement sans qu'aucune donnée n'ait besoin d'être migrée.

create index idx_absences_status on absences (status);

create table absence_versions (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references absences (id) on delete cascade,
  version_number int not null,
  absence_type_id uuid not null references absence_types (id),
  start_date date not null,
  end_date date not null,
  comment text,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references profiles (id),
  decision absence_version_decision,
  decided_at timestamptz,
  decided_by uuid references profiles (id),
  decision_comment text,
  created_at timestamptz not null default now(),
  unique (absence_id, version_number)
);

create index idx_absence_versions_absence on absence_versions (absence_id, version_number desc);

create table absence_events (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references absences (id) on delete cascade,
  version_number int,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references profiles (id),
  actor_role app_role,
  status_before absence_status,
  status_after absence_status,
  old_value jsonb,
  new_value jsonb,
  comment text
);

create index idx_absence_events_absence on absence_events (absence_id, occurred_at);

-- Une seule demande ACTIVE (modification OU annulation) à la fois par
-- absence (section 16) — même mécanisme que `week_reopen_requests` (0014),
-- étendu d'un `kind` pour distinguer les deux natures de demande.
create table absence_reopen_requests (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references absences (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  requested_by uuid references profiles (id) on delete set null,
  kind absence_request_kind not null,
  requested_at timestamptz not null default now(),
  reason text,
  status reopen_request_status not null default 'pending',
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now()
);

create index idx_absence_reopen_requests_absence on absence_reopen_requests (absence_id, created_at desc);
create index idx_absence_reopen_requests_employee on absence_reopen_requests (employee_id);
create unique index uq_absence_reopen_requests_pending on absence_reopen_requests (absence_id) where status = 'pending';

-- ----------------------------------------------------------------------------
-- 2. RLS — même séparation des responsabilités que weekly_plans : la policy
--    ne fait qu'une vérification d'appartenance large (is_self_or_privileged
--    / is_superior_of), toute la logique fine de transition de statut vit
--    dans le trigger `absences_guard` ci-dessous (source unique de vérité).
-- ----------------------------------------------------------------------------
drop policy if exists absences_update on absences;
create policy absences_update on absences for update
  using (public.is_self_or_privileged(employee_id))
  with check (public.is_self_or_privileged(employee_id));

-- Suppression réservée à l'admin, ou au collaborateur sur son propre
-- brouillon jamais soumis (section 22 "Brouillon : Supprimer") — une fois
-- soumise/validée/annulée, une absence n'est plus jamais DELETE (section 10).
drop policy if exists absences_delete on absences;
create policy absences_delete on absences for delete
  using (
    public.is_admin()
    or (employee_id = auth.uid() and status = 'draft')
  );

alter table absence_versions enable row level security;

create policy absence_versions_select on absence_versions for select
  using (exists (select 1 from absences a where a.id = absence_id and public.is_self_or_privileged(a.employee_id)));

create policy absence_versions_insert on absence_versions for insert
  with check (exists (select 1 from absences a where a.id = absence_id and public.is_self_or_privileged(a.employee_id)));

-- Seul un supérieur enregistre une décision (met à jour la ligne existante).
create policy absence_versions_update on absence_versions for update
  using (exists (select 1 from absences a where a.id = absence_id and public.is_superior_of(a.employee_id)))
  with check (exists (select 1 from absences a where a.id = absence_id and public.is_superior_of(a.employee_id)));

alter table absence_events enable row level security;

create policy absence_events_select on absence_events for select
  using (exists (select 1 from absences a where a.id = absence_id and public.is_self_or_privileged(a.employee_id)));

create policy absence_events_insert on absence_events for insert
  with check (exists (select 1 from absences a where a.id = absence_id and public.is_self_or_privileged(a.employee_id)));

alter table absence_reopen_requests enable row level security;

create policy absence_reopen_requests_select on absence_reopen_requests for select
  using (public.is_self_or_privileged(employee_id));

-- Seul le collaborateur lui-même déclenche une demande, et uniquement sur sa
-- propre absence déjà VALIDÉE (contrôle serveur explicite, section 16) —
-- jamais un supérieur "à sa place" : c'est une requête, pas une saisie.
create policy absence_reopen_requests_insert on absence_reopen_requests for insert
  with check (
    employee_id = auth.uid() and requested_by = auth.uid()
    and exists (select 1 from absences a where a.id = absence_id and a.employee_id = auth.uid() and a.status = 'validated')
  );

create policy absence_reopen_requests_update on absence_reopen_requests for update
  using (public.is_superior_of(employee_id))
  with check (public.is_superior_of(employee_id));

-- ----------------------------------------------------------------------------
-- 3. Trigger-garde — même structure que `weekly_plans_guard` (0005/0012/0015) :
--    admin toujours autorisé ; le collaborateur ne peut avancer que depuis
--    brouillon/à modifier (édition + soumission) ou rappeler une soumission ;
--    un supérieur peut toujours valider ou annuler directement (régularisation),
--    en plus des transitions "normales" du cycle de décision.
-- ----------------------------------------------------------------------------
create or replace function public.absences_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.employee_id <> old.employee_id then
    raise exception 'Champs non modifiables';
  end if;

  if old.employee_id = auth.uid() then
    if old.start_date < current_date then
      raise exception 'Absence passée : modification impossible';
    end if;
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status = 'draft' then
      return new;
    end if;
    raise exception 'Absence verrouillée : modification impossible';
  end if;

  if public.is_superior_of(old.employee_id) then
    if new.status in ('validated', 'cancelled') then
      return new;
    end if;
    if old.status in ('draft', 'needs_changes') and new.status in ('draft', 'submitted', 'needs_changes') then
      return new;
    end if;
    if old.status = 'submitted' and new.status = 'needs_changes' then
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

drop trigger if exists trg_absences_guard on absences;
create trigger trg_absences_guard before update on absences
  for each row execute function public.absences_guard();

-- ----------------------------------------------------------------------------
-- 4. Retrait de l'ancien mécanisme silencieux (voir constat en tête de fichier).
-- ----------------------------------------------------------------------------
drop trigger if exists trg_remove_telework_on_absence on absences;
drop function if exists public.remove_telework_on_absence();

-- ----------------------------------------------------------------------------
-- 5. RPC — une transaction atomique par opération (section 27), à l'image de
--    submit_week/recall_week/decide_week/manager_validate_week (0013/0014/0015).
-- ----------------------------------------------------------------------------

-- Création : self-service (brouillon, jamais validé par soi-même) ou par un
-- supérieur/admin pour un rattaché (directement validée — jamais de
-- "soumission à soi-même", même principe que la saisie manager du
-- télétravail). L'autorisation réelle reste portée par la policy
-- `absences_insert` (RLS, inchangée depuis 0006) : cette fonction ne fait que
-- calculer le bon statut/source puis historiser.
create or replace function public.create_absence(
  p_employee_id uuid, p_absence_type_id uuid, p_start_date date, p_end_date date, p_comment text
) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_is_self boolean;
  v_status absence_status;
  v_source absence_source;
begin
  if p_end_date < p_start_date then
    raise exception 'La date de fin doit suivre la date de début.';
  end if;

  select role into v_actor_role from profiles where id = v_actor;
  v_is_self := (p_employee_id = v_actor);
  v_status := case when v_is_self then 'draft' else 'validated' end;
  v_source := case when public.is_admin() then 'admin' when v_is_self then 'employee' else 'hierarchy' end;

  insert into absences (employee_id, absence_type_id, start_date, end_date, comment, source, created_by, status, decided_at, decided_by)
    values (
      p_employee_id, p_absence_type_id, p_start_date, p_end_date, p_comment, v_source, v_actor, v_status,
      case when v_is_self then null else now() end,
      case when v_is_self then null else v_actor end
    )
    returning * into v_absence;

  if not v_is_self then
    insert into absence_versions (absence_id, version_number, absence_type_id, start_date, end_date, comment, submitted_by, decision, decided_at, decided_by)
      values (v_absence.id, 1, p_absence_type_id, p_start_date, p_end_date, p_comment, v_actor, 'validated', now(), v_actor);
  end if;

  insert into absence_events (absence_id, version_number, event_type, actor_id, actor_role, status_before, status_after, new_value)
    values (
      v_absence.id, case when v_is_self then null else 1 end,
      case when v_is_self then 'created' else 'created_and_validated' end,
      v_actor, v_actor_role, null, v_status,
      jsonb_build_object('absenceTypeId', p_absence_type_id, 'startDate', p_start_date, 'endDate', p_end_date, 'comment', p_comment)
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (
      v_actor, case when v_is_self then 'absence_created' else 'absence_created_and_validated' end, 'absence', v_absence.id::text,
      jsonb_build_object('employeeId', p_employee_id, 'status', v_status)
    );

  return v_absence;
end;
$$;

-- Soumission (brouillon/à modifier -> en attente de validation), même
-- principe que submit_week : crée une nouvelle version numérotée, snapshot
-- du contenu au moment de la soumission.
create or replace function public.submit_absence(p_absence_id uuid) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_status_before absence_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_version_number int;
begin
  select status into v_status_before from absences where id = p_absence_id and employee_id = v_actor;
  if v_status_before is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;
  if v_status_before not in ('draft', 'needs_changes') then
    raise exception 'Cette absence ne peut pas être soumise dans son état actuel.';
  end if;

  update absences set status = 'submitted', submitted_at = now() where id = p_absence_id returning * into v_absence;

  select role into v_actor_role from profiles where id = v_actor;
  select coalesce(max(version_number), 0) + 1 into v_version_number from absence_versions where absence_id = p_absence_id;

  insert into absence_versions (absence_id, version_number, absence_type_id, start_date, end_date, comment, submitted_by)
    values (p_absence_id, v_version_number, v_absence.absence_type_id, v_absence.start_date, v_absence.end_date, v_absence.comment, v_actor);

  insert into absence_events (absence_id, version_number, event_type, actor_id, actor_role, status_before, status_after, new_value)
    values (
      p_absence_id, v_version_number, case when v_version_number = 1 then 'submitted' else 'resubmitted' end,
      v_actor, v_actor_role, v_status_before, 'submitted',
      jsonb_build_object('absenceTypeId', v_absence.absence_type_id, 'startDate', v_absence.start_date, 'endDate', v_absence.end_date, 'comment', v_absence.comment)
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (v_actor, 'absence_submitted', 'absence', p_absence_id::text, jsonb_build_object('status', 'submitted'));

  return v_absence;
end;
$$;

-- Rappel d'une demande pas encore traitée (section 17) : en attente ->
-- brouillon (statut existant réutilisé, comme demandé, plutôt que d'en créer
-- un nouveau) — même principe que recall_week.
create or replace function public.recall_absence(p_absence_id uuid) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
begin
  update absences set status = 'draft'
    where id = p_absence_id and employee_id = v_actor and status = 'submitted'
    returning * into v_absence;

  if v_absence.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor;
  insert into absence_events (absence_id, event_type, actor_id, actor_role, status_before, status_after)
    values (p_absence_id, 'recalled', v_actor, v_actor_role, 'submitted', 'draft');

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (v_actor, 'absence_recalled', 'absence', p_absence_id::text, jsonb_build_object('status', 'draft'));

  return v_absence;
end;
$$;

-- Décision du validateur sur une absence soumise (section 2-3) : valide, ou
-- renvoie pour correction (statut vivant "à modifier" dans les deux cas
-- symétriques à decide_week). Transition atomique (UPDATE ... WHERE status
-- = 'submitted') pour trancher proprement une course avec un rappel
-- collaborateur simultané.
create or replace function public.decide_absence(p_absence_id uuid, p_decision absence_version_decision, p_comment text)
returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_new_status absence_status;
  v_version_number int;
begin
  v_new_status := case when p_decision = 'validated' then 'validated' else 'needs_changes' end;

  update absences
    set status = v_new_status, decided_at = now(), decided_by = v_actor,
        manager_comment = case when p_decision = 'changes_requested' then p_comment else null end
    where id = p_absence_id and status = 'submitted'
    returning * into v_absence;

  if v_absence.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor;
  select max(version_number) into v_version_number from absence_versions where absence_id = p_absence_id;

  update absence_versions
    set decision = p_decision, decided_at = now(), decided_by = v_actor, decision_comment = p_comment
    where absence_id = p_absence_id and version_number = v_version_number;

  insert into absence_events (absence_id, version_number, event_type, actor_id, actor_role, status_before, status_after, comment)
    values (
      p_absence_id, v_version_number, case when p_decision = 'validated' then 'validated' else 'changes_requested' end,
      v_actor, v_actor_role, 'submitted', v_new_status, p_comment
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (
      v_actor, case when p_decision = 'validated' then 'absence_validated' else 'absence_needs_changes' end, 'absence', p_absence_id::text,
      jsonb_build_object('status', v_new_status, 'comment', p_comment)
    );

  return v_absence;
end;
$$;

-- Décision sur une demande de réouverture (modification OU annulation,
-- section 5-11) — même principe que decide_reopen_request (0014).
create or replace function public.decide_absence_reopen_request(p_request_id uuid, p_approve boolean, p_comment text)
returns absence_reopen_requests
language plpgsql security invoker set search_path = public as $$
declare
  v_request absence_reopen_requests;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_new_status absence_status;
begin
  update absence_reopen_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_actor, decided_at = now(), decision_comment = p_comment
    where id = p_request_id and status = 'pending'
    returning * into v_request;

  if v_request.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor;

  if p_approve then
    v_new_status := case when v_request.kind = 'cancellation' then 'cancelled' else 'needs_changes' end;

    update absences
      set status = v_new_status, decided_at = now(), decided_by = v_actor,
          manager_comment = coalesce(p_comment, case when v_request.kind = 'cancellation' then 'Annulation acceptée.' else 'Réouverture acceptée.' end)
      where id = v_request.absence_id and status = 'validated';

    insert into absence_events (absence_id, event_type, actor_id, actor_role, status_before, status_after, comment)
      values (
        v_request.absence_id, case when v_request.kind = 'cancellation' then 'cancellation_accepted' else 'reopen_approved' end,
        v_actor, v_actor_role, 'validated', v_new_status, p_comment
      );

    insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
      values (
        v_actor, case when v_request.kind = 'cancellation' then 'absence_cancellation_accepted' else 'absence_reopen_approved' end,
        'absence', v_request.absence_id::text, jsonb_build_object('status', v_new_status)
      );
  else
    insert into absence_events (absence_id, event_type, actor_id, actor_role, comment)
      values (
        v_request.absence_id, case when v_request.kind = 'cancellation' then 'cancellation_rejected' else 'reopen_rejected' end,
        v_actor, v_actor_role, p_comment
      );

    insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
      values (
        v_actor, case when v_request.kind = 'cancellation' then 'absence_cancellation_rejected' else 'absence_reopen_rejected' end,
        'absence', v_request.absence_id::text, jsonb_build_object('comment', p_comment)
      );
  end if;

  return v_request;
end;
$$;

-- Saisie manager "Enregistrer et valider" (section 13) : le manager a déjà
-- ajusté les champs via une UPDATE classique (autorisée par le trigger-garde
-- ci-dessus, depuis n'importe quel statut vivant) — cette fonction valide
-- directement l'état courant en un seul aller-retour, avec une nouvelle
-- version à chaque fois pour ne jamais écraser silencieusement l'historique
-- (même principe que manager_validate_week).
create or replace function public.manager_validate_absence_now(p_absence_id uuid) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_status_before absence_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
  v_version_number int;
begin
  select status into v_status_before from absences where id = p_absence_id;
  if v_status_before is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  update absences set status = 'validated', decided_at = now(), decided_by = v_actor
    where id = p_absence_id
    returning * into v_absence;

  select role into v_actor_role from profiles where id = v_actor;
  select coalesce(max(version_number), 0) + 1 into v_version_number from absence_versions where absence_id = p_absence_id;

  insert into absence_versions (absence_id, version_number, absence_type_id, start_date, end_date, comment, submitted_by, decision, decided_at, decided_by)
    values (p_absence_id, v_version_number, v_absence.absence_type_id, v_absence.start_date, v_absence.end_date, v_absence.comment, v_actor, 'validated', now(), v_actor);

  insert into absence_events (absence_id, version_number, event_type, actor_id, actor_role, status_before, status_after, new_value)
    values (
      p_absence_id, v_version_number, 'manager_override', v_actor, v_actor_role, v_status_before, 'validated',
      jsonb_build_object('absenceTypeId', v_absence.absence_type_id, 'startDate', v_absence.start_date, 'endDate', v_absence.end_date, 'comment', v_absence.comment)
    );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_actor, 'absence_manager_override', 'absence', p_absence_id::text, jsonb_build_object('status', v_status_before), jsonb_build_object('status', 'validated'));

  return v_absence;
end;
$$;

-- Annulation directe par un supérieur (section 14) : jamais de DELETE
-- physique, la ligne reste consultable dans l'historique.
create or replace function public.manager_cancel_absence(p_absence_id uuid, p_comment text) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_status_before absence_status;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
begin
  select status into v_status_before from absences where id = p_absence_id;
  if v_status_before is null or v_status_before = 'cancelled' then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  update absences
    set status = 'cancelled', decided_at = now(), decided_by = v_actor,
        manager_comment = coalesce(p_comment, 'Absence annulée par le manager.')
    where id = p_absence_id
    returning * into v_absence;

  select role into v_actor_role from profiles where id = v_actor;
  insert into absence_events (absence_id, event_type, actor_id, actor_role, status_before, status_after, comment)
    values (p_absence_id, 'manager_cancelled', v_actor, v_actor_role, v_status_before, 'cancelled', p_comment);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    values (
      v_actor, 'absence_manager_cancelled', 'absence', p_absence_id::text,
      jsonb_build_object('status', v_status_before), jsonb_build_object('status', 'cancelled', 'comment', p_comment)
    );

  return v_absence;
end;
$$;

-- Le manager renvoie une absence déjà VALIDÉE au collaborateur pour
-- correction (section 15) — distinct de `decide_absence` (qui ne traite
-- qu'une absence SOUMISE, sections 2-3) : ici il n'existe encore aucune
-- demande de réouverture, le supérieur agit de sa propre initiative.
create or replace function public.manager_request_absence_changes(p_absence_id uuid, p_comment text) returns absences
language plpgsql security invoker set search_path = public as $$
declare
  v_absence absences;
  v_actor uuid := auth.uid();
  v_actor_role app_role;
begin
  update absences
    set status = 'needs_changes', decided_at = now(), decided_by = v_actor, manager_comment = p_comment
    where id = p_absence_id and status = 'validated'
    returning * into v_absence;

  if v_absence.id is null then
    raise exception 'NO_MATCH' using errcode = 'P0001';
  end if;

  select role into v_actor_role from profiles where id = v_actor;
  insert into absence_events (absence_id, event_type, actor_id, actor_role, status_before, status_after, comment)
    values (p_absence_id, 'manager_requested_changes', v_actor, v_actor_role, 'validated', 'needs_changes', p_comment);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
    values (v_actor, 'absence_manager_requested_changes', 'absence', p_absence_id::text, jsonb_build_object('status', 'needs_changes', 'comment', p_comment));

  return v_absence;
end;
$$;
