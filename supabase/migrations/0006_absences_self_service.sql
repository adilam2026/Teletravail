-- ============================================================================
-- Télétravail — auto-déclaration des absences (section 10-14 du cahier des charges)
-- ============================================================================

create or replace function public.self_absence_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from app_settings where key = 'allow_employee_self_absence'), false);
$$;

-- ----------------------------------------------------------------------------
-- absences : un utilisateur peut créer/modifier/supprimer ses propres
-- absences FUTURES si l'option est activée ; les absences passées restent en
-- lecture seule pour lui (un supérieur ou l'admin garde la main dessus, sans
-- restriction de date, comme avant).
-- ----------------------------------------------------------------------------
drop policy if exists absences_insert on absences;
create policy absences_insert on absences for insert
  with check (
    public.is_admin()
    or public.is_superior_of(employee_id)
    or (employee_id = auth.uid() and start_date >= current_date and public.self_absence_allowed())
  );

drop policy if exists absences_update on absences;
create policy absences_update on absences for update
  using (
    public.is_admin()
    or public.is_superior_of(employee_id)
    or (employee_id = auth.uid() and start_date >= current_date and public.self_absence_allowed())
  )
  with check (
    public.is_admin()
    or public.is_superior_of(employee_id)
    or (employee_id = auth.uid() and start_date >= current_date and public.self_absence_allowed())
  );

drop policy if exists absences_delete on absences;
create policy absences_delete on absences for delete
  using (
    public.is_admin()
    or public.is_superior_of(employee_id)
    or (employee_id = auth.uid() and start_date >= current_date and public.self_absence_allowed())
  );

-- Active le self-service par défaut : chaque niveau saisit ses propres congés
-- (section 10 : "chaque utilisateur doit pouvoir saisir ses propres absences").
update app_settings set value = 'true', updated_at = now() where key = 'allow_employee_self_absence';

-- ----------------------------------------------------------------------------
-- Impact immédiat : une absence qui recoupe un jour déjà en télétravail
-- supprime automatiquement ce jour (section 13). Les règles de reprise sont
-- recalculées côté applicatif à la lecture suivante (moteur de règles),
-- aucune donnée dérivée n'a besoin d'être stockée ici.
-- ----------------------------------------------------------------------------
create or replace function public.remove_telework_on_absence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from telework_days td
  using weekly_plans wp
  where td.weekly_plan_id = wp.id
    and wp.employee_id = new.employee_id
    and td.work_date between new.start_date and new.end_date;
  return new;
end;
$$;

create trigger trg_remove_telework_on_absence
  after insert or update of start_date, end_date, employee_id on absences
  for each row execute function public.remove_telework_on_absence();
