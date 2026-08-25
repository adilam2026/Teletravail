import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDirectReports } from "@/lib/data/hierarchy";
import { ValidationScreen } from "@/components/validation/ValidationScreen";

export default async function DuValidationPage() {
  const { profile } = await requireRole("du_head");
  const supabase = await createClient();
  const members = await getDirectReports(supabase, profile);

  return <ValidationScreen supabase={supabase} members={members} title="À valider" subtitle="Semaines soumises par vos Tribe Leads" />;
}
