import { SkeletonHeader, SkeletonListCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />
      <SkeletonListCard rows={4} />
    </div>
  );
}
