-- ============================================================================
-- Vérification manuelle du workflow congés/absences (migration 0016) — pas un
-- test automatisé (aucun harnais Postgres dans ce dépôt), mais un script à
-- coller dans le SQL Editor Supabase.
--
-- SÛR à exécuter sur la base de production : tout est encapsulé dans une
-- transaction `begin ... rollback` — aucune ligne réelle n'est modifiée,
-- quel que soit le résultat. Utilise un couple manager/collaborateur déjà
-- existant (un squad_lead réel avec au moins un membre réel dans sa Squad) —
-- si aucun n'est trouvé, le bloc correspondant est ignoré avec un message
-- explicite plutôt que d'échouer.
--
-- IMPORTANT (leçon du script 0015) : toute fonction renvoyant un type
-- composite (une ligne `absences`) doit être capturée avec
-- `select * into v_row from ma_fonction(...)`, jamais
-- `select ma_fonction(...) into v_row` (ce dernier tente d'assigner la ligne
-- entière au premier champ de la variable et échoue avec "invalid input
-- syntax for type uuid").
-- ============================================================================

begin;

do $$
declare
  v_employee_id uuid;
  v_manager_id uuid;
  v_type_id uuid;
  v_absence_id uuid;
  v_absence_id_2 uuid;
  v_absence absences;
  v_request absence_reopen_requests;
  v_week_1 date := '2099-01-05';
  v_week_2 date := '2099-06-01';
  v_event_count int;
  v_direct_update_blocked boolean;
begin
  select id into v_type_id from absence_types where active limit 1;
  select s.manager_id, p.id
    into v_manager_id, v_employee_id
    from squads s
    join profiles p on p.squad_id = s.id
    where s.manager_id is not null
    limit 1;

  if v_type_id is null or v_manager_id is null or v_employee_id is null then
    raise notice 'PRÉ-REQUIS MANQUANT (type d''absence actif, ou couple squad_lead/membre réel) — script ignoré.';
    return;
  end if;

  raise notice '--- collaborateur % / manager % / type %', v_employee_id, v_manager_id, v_type_id;

  -- =========================================================================
  -- 1. Cycle normal : brouillon -> soumise -> à modifier -> soumise -> validée
  -- =========================================================================
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);

  select * into v_absence from public.create_absence(v_employee_id, v_type_id, v_week_1, v_week_1 + 4, 'Congé annuel');
  if v_absence.status <> 'draft' then
    raise exception 'ÉCHEC 1a : une absence créée par le collaborateur lui-même doit être en brouillon (obtenu %)', v_absence.status;
  end if;
  v_absence_id := v_absence.id;
  raise notice 'OK 1a : création en brouillon.';

  select * into v_absence from public.submit_absence(v_absence_id);
  if v_absence.status <> 'submitted' then
    raise exception 'ÉCHEC 1b : la soumission doit passer en "en attente de validation" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 1b : soumission -> en attente de validation.';

  -- Le manager demande une correction AVANT validation.
  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_absence from public.decide_absence(v_absence_id, 'changes_requested', 'Merci de corriger la date de fin.');
  if v_absence.status <> 'needs_changes' then
    raise exception 'ÉCHEC 1c : une demande de correction doit passer en "à modifier" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 1c : demande de correction -> à modifier.';

  -- Le collaborateur corrige puis resoumet.
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  update absences set end_date = v_week_1 + 3 where id = v_absence_id;
  select * into v_absence from public.submit_absence(v_absence_id);
  if v_absence.status <> 'submitted' then
    raise exception 'ÉCHEC 1d : la resoumission doit repasser en "en attente de validation" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 1d : correction + resoumission -> en attente de validation (jamais auto-validée).';

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_absence from public.decide_absence(v_absence_id, 'validated', null);
  if v_absence.status <> 'validated' then
    raise exception 'ÉCHEC 1e : la validation doit passer l''absence à "validée" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 1e : validation manager -> validée.';

  -- =========================================================================
  -- 2. Réouverture (modification) sur une absence VALIDÉE : refus puis
  --    acceptation, puis nouvelle version qui ne doit PAS être auto-validée.
  -- =========================================================================
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  insert into absence_reopen_requests (absence_id, employee_id, requested_by, kind, reason)
    values (v_absence_id, v_employee_id, v_employee_id, 'modification', 'Retour anticipé')
    returning * into v_request;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_request from public.decide_absence_reopen_request(v_request.id, false, 'Pas cette fois.');
  select status into v_absence.status from absences where id = v_absence_id;
  if v_absence.status <> 'validated' or v_request.status <> 'rejected' then
    raise exception 'ÉCHEC 2a : un refus doit laisser l''absence VALIDÉE et marquer la demande "rejected" (statut absence=%, demande=%)', v_absence.status, v_request.status;
  end if;
  raise notice 'OK 2a : refus de réouverture -> absence toujours validée, demande refusée.';

  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  insert into absence_reopen_requests (absence_id, employee_id, requested_by, kind, reason)
    values (v_absence_id, v_employee_id, v_employee_id, 'modification', 'Retour anticipé, cette fois vraiment')
    returning * into v_request;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_request from public.decide_absence_reopen_request(v_request.id, true, null);
  select status into v_absence.status from absences where id = v_absence_id;
  if v_absence.status <> 'needs_changes' then
    raise exception 'ÉCHEC 2b : une autorisation doit repasser l''absence à "à modifier" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 2b : autorisation de réouverture -> à modifier (le collaborateur récupère la main).';

  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  update absences set end_date = v_week_1 + 2 where id = v_absence_id;
  select * into v_absence from public.submit_absence(v_absence_id);
  if v_absence.status <> 'submitted' then
    raise exception 'ÉCHEC 2c : POINT CRITIQUE — après modification d''une absence rouverte, le nouveau statut doit être "en attente de validation", jamais "validée" directement (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 2c (POINT CRITIQUE) : nouvelle version après réouverture -> en attente de validation, PAS auto-validée.';

  -- =========================================================================
  -- 3. Sécurité : le collaborateur ne peut jamais modifier directement une
  --    absence validée, ni toucher une absence qui n'est pas la sienne.
  -- =========================================================================
  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_absence from public.decide_absence(v_absence_id, 'validated', null);

  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  begin
    update absences set end_date = end_date + 1 where id = v_absence_id;
    v_direct_update_blocked := false;
  exception when others then
    v_direct_update_blocked := true;
    raise notice 'OK 3a (attendu) : modification directe d''une absence validée refusée : %', sqlerrm;
  end;
  if not v_direct_update_blocked then
    raise exception 'ÉCHEC SÉCURITÉ 3a : le collaborateur a pu modifier directement une absence validée !';
  end if;

  -- =========================================================================
  -- 4. Annulation : demande, refus, puis acceptation -> statut "Annulée"
  --    (jamais confondu avec "Refusée", jamais de DELETE physique).
  -- =========================================================================
  insert into absence_reopen_requests (absence_id, employee_id, requested_by, kind, reason)
    values (v_absence_id, v_employee_id, v_employee_id, 'cancellation', 'Finalement je ne pars plus')
    returning * into v_request;

  -- Une seule demande active à la fois : une deuxième demande sur la même
  -- absence doit être rejetée par la contrainte unique (déjà absorbée
  -- normalement côté application via le code 23505, ici on vérifie juste
  -- que la contrainte existe bel et bien en base).
  begin
    insert into absence_reopen_requests (absence_id, employee_id, requested_by, kind, reason)
      values (v_absence_id, v_employee_id, v_employee_id, 'modification', 'Doublon');
    raise exception 'ÉCHEC 4a : une seconde demande active sur la même absence n''a pas été bloquée !';
  exception when unique_violation then
    raise notice 'OK 4a : une seule demande active à la fois (contrainte unique respectée).';
  end;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_request from public.decide_absence_reopen_request(v_request.id, false, 'Trop tard pour annuler.');
  select status into v_absence.status from absences where id = v_absence_id;
  if v_absence.status <> 'validated' or v_request.status <> 'rejected' then
    raise exception 'ÉCHEC 4b : un refus d''annulation doit laisser l''absence VALIDÉE (jamais "Annulée") (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 4b : refus d''annulation -> absence toujours validée (distincte de "Annulée").';

  -- Nouvelle demande d'annulation, acceptée cette fois.
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  insert into absence_reopen_requests (absence_id, employee_id, requested_by, kind, reason)
    values (v_absence_id, v_employee_id, v_employee_id, 'cancellation', 'Cette fois c''est sûr')
    returning * into v_request;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  select * into v_request from public.decide_absence_reopen_request(v_request.id, true, null);
  select status into v_absence.status from absences where id = v_absence_id;
  if v_absence.status <> 'cancelled' then
    raise exception 'ÉCHEC 4c : une acceptation d''annulation doit passer l''absence à "Annulée" (obtenu %, jamais "rejected")', v_absence.status;
  end if;
  raise notice 'OK 4c : acceptation d''annulation -> Annulée (jamais DELETE, toujours consultable).';

  if not exists (select 1 from absences where id = v_absence_id) then
    raise exception 'ÉCHEC SÉCURITÉ 4d : l''absence a été supprimée physiquement, elle doit rester consultable !';
  end if;
  raise notice 'OK 4d : l''absence annulée reste bien en base (aucun DELETE physique).';

  -- =========================================================================
  -- 5. Actions manager directes sur une DEUXIÈME absence : saisie manager
  --    (validation directe), puis annulation directe, puis "demander une
  --    correction" sur une absence déjà validée.
  -- =========================================================================
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  select * into v_absence from public.create_absence(v_employee_id, v_type_id, v_week_2, v_week_2 + 4, null);
  v_absence_id_2 := v_absence.id;

  perform set_config('request.jwt.claim.sub', v_manager_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager_id)::text, true);
  update absences set end_date = v_week_2 + 3 where id = v_absence_id_2;
  select * into v_absence from public.manager_validate_absence_now(v_absence_id_2);
  if v_absence.status <> 'validated' then
    raise exception 'ÉCHEC 5a : la saisie manager doit valider directement, sans resoumission (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 5a : manager modifie directement puis valide -> Validée en un seul geste.';

  select * into v_absence from public.manager_request_absence_changes(v_absence_id_2, 'Merci de vérifier vos dates.');
  if v_absence.status <> 'needs_changes' then
    raise exception 'ÉCHEC 5b : "demander au collaborateur de modifier" doit passer par "à modifier" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 5b : manager demande une correction sur une absence déjà validée -> à modifier.';

  select * into v_absence from public.manager_validate_absence_now(v_absence_id_2);
  select * into v_absence from public.manager_cancel_absence(v_absence_id_2, 'Poste finalement couvert autrement.');
  if v_absence.status <> 'cancelled' then
    raise exception 'ÉCHEC 5c : l''annulation directe manager doit passer l''absence à "Annulée" (obtenu %)', v_absence.status;
  end if;
  raise notice 'OK 5c : annulation directe par le manager -> Annulée.';

  -- =========================================================================
  -- 6. Historique : chaque étape ci-dessus doit avoir laissé une trace.
  -- =========================================================================
  select count(*) into v_event_count from absence_events where absence_id in (v_absence_id, v_absence_id_2);
  if v_event_count < 10 then
    raise exception 'ÉCHEC 6 : historique incomplet (% événements seulement)', v_event_count;
  end if;
  raise notice 'OK 6 : historique complet (% événements enregistrés sur les deux absences).', v_event_count;

  raise notice '=== TOUS LES CONTRÔLES SONT PASSÉS ===';
end $$;

rollback;
