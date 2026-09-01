import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-7 w-32" />
      <div className="card space-y-3">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-3/4" />
      </div>
      <div className="card space-y-3">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-full" />
      </div>
    </div>
  );
}
