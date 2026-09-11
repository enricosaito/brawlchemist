import { CardGridSkeleton, PageSkeleton, Skeleton } from "@/components/site/skeletons"

/** Tracked-players grid. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="mb-4 h-7 w-48" />
      <CardGridSkeleton count={6} height="h-28" />
    </PageSkeleton>
  )
}
