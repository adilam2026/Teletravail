import { SkeletonBlock, SkeletonWeekCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-16 w-full" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonBlock className="h-7 w-56" />
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
