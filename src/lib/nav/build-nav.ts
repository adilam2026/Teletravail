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
  const isTeamLead = profile.role === "squad_lead" || profile.role === "tribe_lead" || profile.role === "du_head";
  const items: NavItem[] = [];

  // Vue d'équipe d'abord (section 20 : c'est ce que la ligne managériale
  // consulte en priorité en se connectant), puis vue personnelle ensuite —
  // les deux sont clairement étiquetées pour ne pas se mélanger dans la
  // même liste (retour utilisateur : "on se perd").
  if (isTeamLead) {
    const pending = await countPendingValidations(supabase, profile);
    if (profile.role === "squad_lead") {
      items.push({ href: "/squad/planning", label: "Planning équipe", icon: "📆", badge: pending, section: "Mon équipe" });
      items.push({ href: "/squad/team", label: "Ma Squad", icon: "👥", section: "Mon équipe" });
      items.push({ href: "/squad/absences", label: "Absences de la Squad", icon: "🌴", section: "Mon équipe" });
    } else if (profile.role === "tribe_lead") {
      items.push({ href: "/tribe/planning", label: "Planning équipe", icon: "📆", badge: pending, section: "Mon équipe" });
      items.push({ href: "/tribe/overview", label: "Ma Tribe", icon: "🧭", section: "Mon équipe" });
    } else {
      items.push({ href: "/du/planning", label: "Planning équipe", icon: "📆", badge: pending, section: "Mon équipe" });
      items.push({ href: "/du/overview", label: "Ma DU", icon: "🏛️", section: "Mon équipe" });
    }
  }

  const personalSection = isTeamLead ? "Moi" : undefined;
  items.push(
    { href: "/employee/agenda", label: "Saisie télétravail", icon: "📅", section: personalSection },
    { href: "/employee/planning", label: "Planning", icon: "🗂️", section: personalSection },
    { href: "/employee/absences", label: "Mes absences", icon: "🌴", section: personalSection },
    { href: "/employee/history", label: "Historique", icon: "🕘", section: personalSection },
    { href: "/employee/profile", label: "Mon profil", icon: "👤", section: personalSection }
  );

  return { roleLabel: ROLE_LABELS[profile.role], items };
}
