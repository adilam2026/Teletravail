import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildNavForRole } from "@/lib/nav/build-nav";
import { AppShell } from "@/components/nav/AppShell";

/**
 * Layout partagé pour "saisir/modifier la semaine d'un rattaché" (section
 * 14-19) : accessible à tous les niveaux hiérarchiques (Squad/Tribe/DU/
 * Admin), la même page cible sert donc un seul layout plutôt que d'être
 * dupliquée sous /squad, /tribe et /du.
 */
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const { roleLabel, items } = await buildNavForRole(supabase, profile);

  return (
    <AppShell roleLabel={roleLabel} userName={`${profile.first_name} ${profile.last_name}`} items={items}>
      {children}
    </AppShell>
  );
}
