import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEmployeeMonth } from "@/lib/data/planning";
import { currentMonth, shiftMonth } from "@/lib/date/casablanca";
import { PlanningCalendar } from "@/components/calendar/PlanningCalendar";

/**
 * Vue d'ensemble en consultation seule, volontairement différente de "Mon
 * agenda" à la fois fonctionnellement (aucune interaction, aucune mutation)
 * et visuellement (table calendrier consolidée, pas de cartes cliquables ni
 * de quota par semaine) — pour ça, "Mon agenda" (édition) et "Mes absences"
 * (ajout) restent les écrans dédiés à la saisie. Réutilise exactement les
 * mêmes données que l'agenda (`loadEmployeeMonth`), donc les mêmes badges
 * d'absence/férié, sans dupliquer la logique métier.
 */
export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { profile } = await requireUser();
  const params = await searchParams;
  const month = params.month ?? currentMonth();

  const supabase = await createClient();
  const { weeks } = await loadEmployeeMonth(supabase, profile, month);

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning</h1>
          <p className="mt-1 text-sm text-slate-500">Vue consolidée de votre télétravail, présence et absences.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Link href={`/employee/planning?month=${shiftMonth(month, -1)}`} className="btn-secondary" aria-label="Mois précédent">
              ‹
            </Link>
            <span className="min-w-[10rem] text-center text-base font-semibold capitalize text-slate-900">{monthLabel}</span>
            <Link href={`/employee/planning?month=${shiftMonth(month, 1)}`} className="btn-secondary" aria-label="Mois suivant">
              ›
            </Link>
          </div>
        </div>
      </div>

      {weeks.length > 0 ? <PlanningCalendar weeks={weeks} /> : <p className="card text-center text-sm text-slate-400">Aucune semaine pour ce mois.</p>}
    </div>
  );
}
