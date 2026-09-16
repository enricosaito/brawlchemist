import {
  CardGridSkeleton,
  ControlRowSkeleton,
  PageSkeleton,
  Skeleton,
} from "@/components/site/skeletons"

/**
 * /live is force-dynamic — every visit is a fresh DB read, so it always has a
 * gap to fill. Movers strip on top, then the live card grid.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton widths={[160, 320, 120]} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <CardGridSkeleton count={9} height="h-28" />
    </PageSkeleton>
  )
}
