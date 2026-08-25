-- Télétravail — nouvelle règle demandée : interdire le "pont" vendredi
-- (semaine N) + lundi (semaine N+1). Distincte de "monday_friday_forbidden",
-- qui ne couvre que lundi + vendredi de la MÊME semaine.
insert into telework_rules (key, value, description)
values ('friday_monday_bridge_forbidden', 'true', 'Interdire le pont vendredi (semaine N) + lundi (semaine N+1)')
on conflict (key) do nothing;
