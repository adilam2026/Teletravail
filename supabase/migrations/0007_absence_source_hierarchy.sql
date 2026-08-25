-- Télétravail — renomme la valeur d'énum "manager" en "hierarchy" pour
-- absence_source : une absence déclarée pour un rattaché peut désormais
-- l'être par un Squad Lead, un Tribe Lead ou un Responsable DU, plus
-- seulement un "manager" (rôle qui n'existe plus).
alter type absence_source rename value 'manager' to 'hierarchy';
