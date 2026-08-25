import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /manifest.webmanifest et /sw.js doivent rester accessibles sans session :
// un navigateur peut les demander avant toute connexion (ex. installation
// de la PWA depuis l'écran de login) — les rediriger vers /login casserait
// silencieusement l'enregistrement du service worker.
const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon.ico", "/manifest.webmanifest", "/sw.js"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Rafraîchit le token si besoin — nécessaire pour que la session reste
  // valide côté Server Components (cf. doc Supabase SSR).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    // Ne redirige hors de /login que si le profil applicatif est bien actif :
    // sinon (profil supprimé, ou désactivé pendant que la session Supabase
    // reste valide), requireUser() sur "/" renverrait aussitôt vers /login,
    // créant une boucle de redirection infinie (cf. incident self-lockout).
    const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (profile?.status === "active") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
