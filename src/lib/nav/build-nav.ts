import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { countPendingValidations } from "@/lib/data/hierarchy";
import type { NavItem } from "@/components/nav/NavSidebar";

const ROLE_LABELS: Record<ProfileRow["role"], string> = {
  admin: "Administrateur",
  du_head: "Responsable DU",
  tribe_lead: "Tribe Lead",
  squad_lead: "Squad Lead",
  employee: "Collaborateur",
};

/**
 * Navigation commune à tous les niveaux hiérarchiques (section 20) : chacun
 * dispose de son propre agenda, complété par l'écran d'équipe et de
 * validation correspondant à son niveau. Une seule fonction pour ne pas
 * dupliquer cette logique dans 4 layouts différents.
 */
export async function buildNavForRole(supabase: AppSupabaseClient, profile: ProfileRow): Promise<{ roleLabel: string; items: NavItem[] }> {
  const items: NavItem[] = [{ href: "/employee/agenda", label: "Mon agenda", icon: "📅" }];

  if (profile.role === "squad_lead" || profile.role === "tribe_lead" || profile.role === "du_head") {
    const pending = await countPendingValidations(supabase, profile);
    if (profile.role === "squad_lead") {
      items.push({ href: "/squad/team", label: "Ma Squad", icon: "👥" });
      items.push({ href: "/squad/planning", label: "Planning équipe", icon: "📆" });
      items.push({ href: "/squad/validation", label: "À valider", icon: "✅", badge: pending });
      items.push({ href: "/squad/absences", label: "Absences de la Squad", icon: "🌴" });
    } else if (profile.role === "tribe_lead") {
      items.push({ href: "/tribe/overview", label: "Ma Tribe", icon: "🧭" });
      items.push({ href: "/tribe/validation", label: "À valider", icon: "✅", badge: pending });
    } else {
      items.push({ href: "/du/overview", label: "Ma DU", icon: "🏛️" });
      items.push({ href: "/du/validation", label: "À valider", icon: "✅", badge: pending });
    }
  }

  items.push(
    { href: "/employee/weeks", label: "Mes semaines", icon: "🗂️" },
    { href: "/employee/absences", label: "Mes absences", icon: "🌴" },
    { href: "/employee/history", label: "Historique", icon: "🕘" },
    { href: "/employee/profile", label: "Mon profil", icon: "👤" }
  );

  return { roleLabel: ROLE_LABELS[profile.role], items };
}
