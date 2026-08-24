import { requireRole } from "@/lib/auth/session";
import { AppShell } from "@/components/nav/AppShell";

const NAV_ITEMS = [
  { href: "/employee/agenda", label: "Mon agenda", icon: "📅" },
  { href: "/employee/weeks", label: "Mes semaines", icon: "🗂️" },
  { href: "/employee/absences", label: "Mes absences", icon: "🌴" },
  { href: "/employee/history", label: "Historique", icon: "🕘" },
  { href: "/employee/profile", label: "Mon profil", icon: "👤" },
];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("employee");
  return (
    <AppShell role="employee" userName={`${profile.first_name} ${profile.last_name}`} items={NAV_ITEMS}>
      {children}
    </AppShell>
  );
}
