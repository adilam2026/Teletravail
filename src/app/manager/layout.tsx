import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { countPendingValidations } from "@/lib/data/team";
import { AppShell } from "@/components/nav/AppShell";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("manager");
  const supabase = await createClient();
  const pending = await countPendingValidations(supabase, profile.id);

  const navItems = [
    { href: "/manager/team", label: "Mon équipe", icon: "👥" },
    { href: "/manager/planning", label: "Planning équipe", icon: "📅" },
    { href: "/manager/validation", label: "À valider", icon: "✅", badge: pending },
    { href: "/manager/absences", label: "Absences", icon: "🌴" },
    { href: "/manager/history", label: "Historique", icon: "🕘" },
    { href: "/manager/profile", label: "Mon profil", icon: "👤" },
  ];

  return (
    <AppShell role="manager" userName={`${profile.first_name} ${profile.last_name}`} items={navItems}>
      {children}
    </AppShell>
  );
}
