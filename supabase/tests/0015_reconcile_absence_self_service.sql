-- ============================================================================
-- Vérification manuelle du correctif 0015 (reconcile_week_absence_conflict /
-- weekly_plans_guard) — pas un test automatisé (aucun harnais Postgres dans
-- ce dépôt), mais un script à coller dans le SQL Editor Supabase.
--
-- SÛR à exécuter sur la base de production : tout est encapsulé dans une
-- transaction `begin ... rollback` — aucune ligne réelle n'est modifiée,
-- quel que soit le résultat. Utilise un profil `employee` déjà existant
-- (n'importe lequel), mais crée ses propres semaines de test sur des
-- `week_start` très éloignés (2099) pour ne jamais entrer en collision avec
-- une vraie semaine.
--
-- Pour constater le bug AVANT correctif : exécuter ce script après 0014 mais
-- avant 0015 — l'étape 3 doit échouer avec `ÉCHEC : ...`.
-- Pour constater la correction : exécuter après 0015 — tout doit afficher OK
-- et se terminer par `=== TOUS LES CONTRÔLES SONT PASSÉS ===`.
-- ============================================================================

begin;

do $$
declare
  v_employee_id uuid;
  v_plan_id_1 uuid;
  v_plan_id_2 uuid;
  v_week_1 date := '2099-01-05';
  v_wednesday date := '2099-01-07';
  v_week_2 date := '2099-02-02';
  v_result weekly_plans;
  v_remaining_count int;
  v_event_count int;
  v_days_before jsonb;
  v_direct_update_blocked boolean := false;
begin
  select id into v_employee_id from profiles where role = 'employee' limit 1;
  if v_employee_id is null then
    raise notice 'AUCUN PROFIL employee TROUVÉ — test ignoré (créez un compte de test employé pour le rejouer).';
    return;
  end if;

  -- 1. Semaine de test déjà VALIDÉE avec un mercredi en télétravail.
  --    (un INSERT ne déclenche pas le trigger BEFORE UPDATE : pas de blocage ici)
  insert into weekly_plans (employee_id, week_start, status)
    values (v_employee_id, v_week_1, 'validated')
    returning id into v_plan_id_1;
  insert into telework_days (weekly_plan_id, work_date) values (v_plan_id_1, v_wednesday);

  raise notice '--- ÉTAT INITIAL : plan % (employee %), status=validated, TT le %', v_plan_id_1, v_employee_id, v_wednesday;

  -- 2. Simule "je suis ce collaborateur" (comme sa session réelle quand il
  --    pose lui-même son absence). Les deux formats de claim JWT sont
  --    positionnés pour couvrir les deux conventions possibles d'auth.uid().
  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_employee_id)::text, true);
  raise notice '--- auth.uid() simulé = % (doit être identique à l''employé ci-dessus)', auth.uid();

  -- 3. Réconciliation : une absence commençant jeudi invalide ce mercredi.
  select public.reconcile_week_absence_conflict(v_plan_id_1, array[v_wednesday::text]) into v_result;

  select count(*) into v_remaining_count from telework_days where weekly_plan_id = v_plan_id_1 and work_date = v_wednesday;
  select count(*) into v_event_count from weekly_plan_events where weekly_plan_id = v_plan_id_1 and event_type = 'absence_conflict_reopened';
  select days_before into v_days_before from weekly_plan_events where weekly_plan_id = v_plan_id_1 and event_type = 'absence_conflict_reopened' limit 1;

  raise notice '--- APRÈS RÉCONCILIATION : status=% (attendu needs_changes), TT du % encore présent=% (attendu false), événement historisé=% (attendu true), days_before=%',
    v_result.status, v_wednesday, (v_remaining_count > 0), (v_event_count > 0), v_days_before;

  if v_result.status <> 'needs_changes' or v_remaining_count > 0 or v_event_count = 0 then
    raise exception 'ÉCHEC : la réconciliation n''a pas correctement rouvert/corrigé la semaine (bug non corrigé ?)';
  end if;
  raise notice 'OK : réconciliation correcte sur semaine validée en auto-service.';

  -- 4. Contrôle de sécurité, sur une AUTRE semaine du même collaborateur
  --    (jamais passée par reconcile_week_absence_conflict) : le drapeau
  --    posé à l'étape 3 est propre au plan_id_1 et ne doit servir à rien ici.
  --    Une tentative de modification DIRECTE (hors mécanique de
  --    réconciliation) doit rester refusée.
  insert into weekly_plans (employee_id, week_start, status)
    values (v_employee_id, v_week_2, 'validated')
    returning id into v_plan_id_2;

  begin
    update weekly_plans set status = 'needs_changes' where id = v_plan_id_2;
    v_direct_update_blocked := false;
  exception when others then
    v_direct_update_blocked := true;
    raise notice 'OK (attendu) : tentative de modification DIRECTE d''une autre semaine validée refusée : %', sqlerrm;
  end;

  if not v_direct_update_blocked then
    raise exception 'ÉCHEC SÉCURITÉ : un collaborateur a pu modifier directement une semaine validée hors du mécanisme de réconciliation !';
  end if;

  raise notice '=== TOUS LES CONTRÔLES SONT PASSÉS ===';
end $$;

rollback;
