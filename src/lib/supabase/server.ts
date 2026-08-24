import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Client Supabase pour Server Components / Route Handlers / Server Actions —
 * respecte RLS via le rôle `authenticated` (JWT de l'utilisateur connecté).
 * C'est le client à utiliser pour toute lecture/écriture "normale" : la
 * sécurité est appliquée par Postgres, pas seulement par ce code.
 */
export type AppSupabaseClient = ReturnType<typeof createServerClient<Database>>;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : ignoré, le middleware rafraîchit la session.
          }
        },
      },
    }
  );
}
