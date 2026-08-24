import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateHolidayForm, HolidayRowActions } from "@/components/admin/HolidayForm";

const TYPE_LABELS: Record<string, string> = { national: "National", religious: "Religieux", exceptional: "Exceptionnel" };

export default async function AdminHolidaysPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: holidays } = await supabase.from("public_holidays").select("*").order("date");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jours fériés</h1>
          <p className="text-sm text-slate-500">Calendrier national et fêtes religieuses (prévisionnelles)</p>
        </div>
        <CreateHolidayForm />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-400">
              <th className="px-5 py-3">Nom</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Statut</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(holidays ?? []).map((h) => (
              <tr key={h.id} className="border-b border-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">
                  {h.type === "religious" ? "🕌" : "🇲🇦"} {h.name}
                </td>
                <td className="px-3 py-3 text-slate-600">{h.date}</td>
                <td className="px-3 py-3 text-slate-600">{TYPE_LABELS[h.type]}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${h.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {h.status === "confirmed" ? "Confirmé" : "Prévisionnel"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <HolidayRowActions holiday={h} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(holidays ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun jour férié.</p>}
      </div>
    </div>
  );
}
