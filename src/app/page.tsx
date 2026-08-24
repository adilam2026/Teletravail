import { redirect } from "next/navigation";
import { homePathForRole, requireUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  redirect(homePathForRole(user.profile.role));
}
