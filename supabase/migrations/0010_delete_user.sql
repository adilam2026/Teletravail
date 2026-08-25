-- Télétravail — permet la suppression définitive d'un compte (distincte de
-- la désactivation, section demandée par l'administrateur). Les colonnes
-- d'attribution ("créé par", "validé par", "mis à jour par", "responsable
-- de"...) référencent profiles(id) sans règle de suppression explicite
-- (NO ACTION par défaut) : supprimer un profil bloquerait sur la moindre
-- ligne d'historique qui le mentionne. On les fait passer à NULL, ce qui
-- préserve l'historique existant (les lignes restent, l'attribution devient
-- "inconnue") sans jamais bloquer la suppression. Les données réellement
-- possédées par l'utilisateur (weekly_plans, absences, rule_overrides,
-- notifications, membership_changes) restent en CASCADE, déjà en place.
-- Exception : une exception ("company_exceptions") à périmètre "un seul
-- collaborateur" n'a plus de sens sans ce collaborateur — elle est donc
-- supprimée avec lui plutôt que laissée orpheline.
alter table absences drop constraint absences_created_by_fkey,
  add constraint absences_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table app_settings drop constraint app_settings_updated_by_fkey,
  add constraint app_settings_updated_by_fkey foreign key (updated_by) references profiles (id) on delete set null;

alter table audit_logs drop constraint audit_logs_actor_id_fkey,
  add constraint audit_logs_actor_id_fkey foreign key (actor_id) references profiles (id) on delete set null;

alter table company_exceptions drop constraint company_exceptions_created_by_fkey,
  add constraint company_exceptions_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table company_exceptions drop constraint company_exceptions_employee_id_fkey,
  add constraint company_exceptions_employee_id_fkey foreign key (employee_id) references profiles (id) on delete cascade;

alter table membership_changes drop constraint membership_changes_changed_by_fkey,
  add constraint membership_changes_changed_by_fkey foreign key (changed_by) references profiles (id) on delete set null;

alter table organizational_units drop constraint organizational_units_created_by_fkey,
  add constraint organizational_units_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table organizational_units drop constraint organizational_units_manager_id_fkey,
  add constraint organizational_units_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;

alter table profiles drop constraint profiles_created_by_fkey,
  add constraint profiles_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table public_holidays drop constraint public_holidays_created_by_fkey,
  add constraint public_holidays_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table public_holidays drop constraint public_holidays_updated_by_fkey,
  add constraint public_holidays_updated_by_fkey foreign key (updated_by) references profiles (id) on delete set null;

alter table rule_overrides drop constraint rule_overrides_created_by_fkey,
  add constraint rule_overrides_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table squads drop constraint squads_created_by_fkey,
  add constraint squads_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table squads drop constraint squads_manager_id_fkey,
  add constraint squads_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;

alter table telework_rules drop constraint telework_rules_updated_by_fkey,
  add constraint telework_rules_updated_by_fkey foreign key (updated_by) references profiles (id) on delete set null;

alter table tribes drop constraint tribes_created_by_fkey,
  add constraint tribes_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table tribes drop constraint tribes_manager_id_fkey,
  add constraint tribes_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;

alter table weekly_plans drop constraint weekly_plans_decided_by_fkey,
  add constraint weekly_plans_decided_by_fkey foreign key (decided_by) references profiles (id) on delete set null;
