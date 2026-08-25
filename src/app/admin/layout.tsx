import { requireRole } from "@/lib/auth/session";
import { AppShell } from "@/components/nav/AppShell";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/admin/users", label: "Utilisateurs", icon: "👥" },
  { href: "/admin/organisation", label: "Organisation", icon: "🏷️" },
  { href: "/admin/planning", label: "Planning global", icon: "📅" },
  { href: "/admin/holidays", label: "Jours fériés", icon: "🇲🇦" },
  { href: "/admin/absences", label: "Absences", icon: "🌴" },
  { href: "/admin/rules", label: "Règles", icon: "⚙️" },
  { href: "/admin/exceptions", label: "Exceptions", icon: "🔒" },
  { href: "/admin/history", label: "Historique", icon: "🕘" },
  { href: "/admin/settings", label: "Paramètres", icon: "🛠️" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("admin");
  return (
    <AppShell roleLabel="Administrateur" userName={`${profile.first_name} ${profile.last_name}`} items={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
