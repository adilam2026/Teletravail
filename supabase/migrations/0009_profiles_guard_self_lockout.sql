-- Télétravail — corrige profiles_guard() : la protection "un utilisateur ne
-- peut pas changer son propre rôle/statut/rattachement/login" passait AVANT
-- le court-circuit is_admin(), ce qui permettait à un administrateur de se
-- désactiver (ou de changer son propre rôle) lui-même sans aucun garde-fou —
-- verrouillant l'accès admin de l'application (cf. incident self-lockout).
-- La vérification s'applique désormais à tout le monde, admin compris ; un
-- administrateur garde un contrôle total sur les AUTRES profils.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id then
    if new.role <> old.role
      or new.squad_id is distinct from old.squad_id
      or new.employee_type is distinct from old.employee_type
      or new.status <> old.status
      or new.login <> old.login then
      raise exception 'Modification non autorisée sur votre propre profil';
    end if;
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if public.is_superior_of(old.id) then
    if public.role_rank(new.role) >= public.role_rank(public.current_role()) then
      raise exception 'Impossible d''attribuer un rôle égal ou supérieur au vôtre';
    end if;
    return new;
  end if;

  raise exception 'Non autorisé';
end;
$$;
