import { SkeletonBlock, SkeletonWeekCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <SkeletonBlock className="h-9 w-56" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonWeekCard key={i} />
        ))}
      </div>
    </div>
  );
}
