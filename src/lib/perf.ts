import "server-only";

/**
 * Chronomètre un appel serveur et le journalise en développement seulement
 * (section 32-33 du cahier des charges perf) — jamais en production, pour
 * ne pas polluer les logs Vercel une fois la mesure faite.
 */
export async function perfTime<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (process.env.NODE_ENV === "production") return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[PERF] ${label}: ${ms}ms`);
  }
}
