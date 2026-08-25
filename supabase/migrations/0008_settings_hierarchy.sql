-- Télétravail — ajuste app_settings pour la hiérarchie à 4 niveaux :
-- retire le réglage obsolète "allow_manager_create_manager" (rôle disparu)
-- et ajoute "du_head_auto_validate" qui pilote le comportement de
-- submitWeek() quand un Responsable DU soumet sa propre semaine
-- (section 19-20 du cahier des charges).
delete from app_settings where key = 'allow_manager_create_manager';

insert into app_settings (key, value)
values ('du_head_auto_validate', 'false')
on conflict (key) do nothing;
