import { PageSkeleton, Skeleton } from "@/components/site/skeletons"

/** Search bar stays put; the result rows fill in beneath it. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto mb-6 flex max-w-xl justify-center">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <div className="mx-auto grid max-w-xl gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  )
}
