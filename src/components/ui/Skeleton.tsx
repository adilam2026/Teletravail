/**
 * Squelettes très légers (section 3 du cahier des charges perf) : affichés
 * instantanément par le fallback `loading.tsx` de chaque route pendant que
 * le contenu réel se charge, pour ne jamais laisser un clic de navigation
 * sur un écran figé/blanc.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export function SkeletonHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-4 w-56" />
      </div>
      <SkeletonBlock className="h-9 w-32" />
    </div>
  );
}

export function SkeletonListCard({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-slate-100 p-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-48" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <SkeletonBlock className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonWeekCard() {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-5 w-32" />
        <SkeletonBlock className="h-5 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[76px]" />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-8 w-36" />
      </div>
    </div>
  );
}
