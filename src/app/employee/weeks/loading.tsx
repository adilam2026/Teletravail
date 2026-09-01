import { SkeletonHeader, SkeletonListCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonListCard rows={8} />
    </div>
  );
}
