import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildNavForRole } from "@/lib/nav/build-nav";
import { AppShell } from "@/components/nav/AppShell";

export default async function SquadLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("squad_lead");
  const supabase = await createClient();
  const { roleLabel, items } = await buildNavForRole(supabase, profile);

  return (
    <AppShell roleLabel={roleLabel} userName={`${profile.first_name} ${profile.last_name}`} items={items}>
      {children}
    </AppShell>
  );
}
