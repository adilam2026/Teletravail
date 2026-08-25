-- ============================================================================
-- Télétravail — données de référence
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Règles de télétravail (moteur de règles — voir src/lib/rules-engine)
-- ----------------------------------------------------------------------------
insert into telework_rules (key, value, description) values
  ('quota_internal', '2', 'Nombre maximum de jours de télétravail / semaine pour un collaborateur interne'),
  ('quota_external', '1', 'Nombre maximum de jours de télétravail / semaine pour un collaborateur externe'),
  ('consecutive_days_forbidden', 'true', 'Interdire deux jours de télétravail consécutifs'),
  ('monday_friday_forbidden', 'true', 'Interdire la combinaison lundi + vendredi la même semaine'),
  ('return_after_absence_forbidden', 'true', 'Interdire le télétravail le jour de reprise après une absence'),
  ('return_after_bridge_enabled', 'true', 'Étendre la règle de reprise à travers un week-end/jour férié (dernier jour ouvré précédent)'),
  ('rotation_enabled', 'true', 'Activer le contrôle de rotation des jours de télétravail'),
  ('rotation_weeks', '4', 'Nombre de semaines précédentes analysées pour la rotation'),
  ('rotation_threshold', '0.75', 'Proportion de semaines avec le même jeu de jours au-delà de laquelle une alerte est levée'),
  ('rotation_mode', '"alert"', 'Mode de la règle de rotation : information | alert | block'),
  ('team_presence_min_percent', '50', 'Seuil minimum de présence prévisionnelle au bureau par jour, en %'),
  ('team_presence_mode', '"alert"', 'Mode du contrôle de présence équipe : disabled | alert | block'),
  ('submission_deadline_enabled', 'false', 'Activer une date limite de soumission pour la semaine suivante'),
  ('submission_deadline_weekday', '4', 'Jour limite de soumission (1=lundi ... 7=dimanche)'),
  ('submission_deadline_hour', '18', 'Heure limite de soumission (0-23, Africa/Casablanca)'),
  ('submission_deadline_mode', '"block"', 'Mode de la date limite : alert | block');

-- ----------------------------------------------------------------------------
-- Réglages applicatifs
-- ----------------------------------------------------------------------------
insert into app_settings (key, value) values
  ('allow_admin_create_admin', 'false'),
  ('allow_employee_self_absence', 'false'),
  ('du_head_auto_validate', 'false');

-- ----------------------------------------------------------------------------
-- Types d'absence
-- ----------------------------------------------------------------------------
insert into absence_types (name, code, triggers_return_rule) values
  ('Congé annuel', 'CONGE', true),
  ('Maladie', 'MALADIE', true),
  ('Autorisation d''absence', 'AUTORISATION', true),
  ('Congé exceptionnel', 'CONGE_EXCEPTIONNEL', true),
  ('Formation', 'FORMATION', true),
  ('Mission', 'MISSION', false),
  ('Autre', 'AUTRE', true);

-- ----------------------------------------------------------------------------
-- Jours fériés nationaux du Maroc — dates fixes (administrables ensuite)
-- ----------------------------------------------------------------------------
insert into public_holidays (name, date, type, status, source) values
  ('Nouvel An', '2025-01-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Manifeste de l''Indépendance', '2025-01-11', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Travail', '2025-05-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Trône', '2025-07-30', 'national', 'confirmed', 'Calendrier officiel'),
  ('Journée de Oued Eddahab', '2025-08-14', 'national', 'confirmed', 'Calendrier officiel'),
  ('Révolution du Roi et du Peuple', '2025-08-20', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de la Jeunesse', '2025-08-21', 'national', 'confirmed', 'Calendrier officiel'),
  ('Anniversaire de la Marche Verte', '2025-11-06', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de l''Indépendance', '2025-11-18', 'national', 'confirmed', 'Calendrier officiel'),

  ('Nouvel An', '2026-01-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Manifeste de l''Indépendance', '2026-01-11', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Travail', '2026-05-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Trône', '2026-07-30', 'national', 'confirmed', 'Calendrier officiel'),
  ('Journée de Oued Eddahab', '2026-08-14', 'national', 'confirmed', 'Calendrier officiel'),
  ('Révolution du Roi et du Peuple', '2026-08-20', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de la Jeunesse', '2026-08-21', 'national', 'confirmed', 'Calendrier officiel'),
  ('Anniversaire de la Marche Verte', '2026-11-06', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de l''Indépendance', '2026-11-18', 'national', 'confirmed', 'Calendrier officiel'),

  ('Nouvel An', '2027-01-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Manifeste de l''Indépendance', '2027-01-11', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Travail', '2027-05-01', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête du Trône', '2027-07-30', 'national', 'confirmed', 'Calendrier officiel'),
  ('Journée de Oued Eddahab', '2027-08-14', 'national', 'confirmed', 'Calendrier officiel'),
  ('Révolution du Roi et du Peuple', '2027-08-20', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de la Jeunesse', '2027-08-21', 'national', 'confirmed', 'Calendrier officiel'),
  ('Anniversaire de la Marche Verte', '2027-11-06', 'national', 'confirmed', 'Calendrier officiel'),
  ('Fête de l''Indépendance', '2027-11-18', 'national', 'confirmed', 'Calendrier officiel');

-- ----------------------------------------------------------------------------
-- Fêtes religieuses — dates PRÉVISIONNELLES (basées sur le calendrier
-- hégirien estimé). Elles doivent être vérifiées et confirmées par un
-- administrateur via Administration > Jours fériés avant l'échéance :
-- l'observation lunaire officielle peut décaler ces dates de 1 à 2 jours.
-- ----------------------------------------------------------------------------
insert into public_holidays (name, date, type, status, source) values
  ('Aïd Al-Fitr (jour 1)', '2026-03-20', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer'),
  ('Aïd Al-Fitr (jour 2)', '2026-03-21', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer'),
  ('Aïd Al-Adha (jour 1)', '2026-05-27', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer'),
  ('Aïd Al-Adha (jour 2)', '2026-05-28', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer'),
  ('1er Moharram (Nouvel An Hégirien)', '2026-06-16', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer'),
  ('Aïd Al-Mawlid', '2026-08-25', 'religious', 'provisional', 'Estimation calendrier hégirien — à confirmer');
