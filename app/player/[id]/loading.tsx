import { Skeleton } from "@/components/site/skeletons"

/**
 * Profile loading state.
 *
 * The profile is the deepest render in the app — read-through ranked payload,
 * lifetime stats, guild, esports, cutoffs and customization — so it's the page
 * most worth acknowledging immediately. Geometry mirrors ProfileHeader: banner
 * card with the identity block, the stat-tile row, the tab strip, then the
 * Overview two-column body.
 */
export default function Loading() {
  return (
    <main className="pb-16" aria-busy aria-label="Loading player profile">
      <section className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-[1280px]">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
            <Skeleton className="h-28 rounded-none sm:h-32" />
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 shrink-0 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-6 w-52 max-w-full" />
                  <Skeleton className="h-3 w-36 max-w-full" />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[88px] rounded-xl sm:flex-1" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab strip */}
      <div className="mt-6 px-4 sm:px-6">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 border-b border-border/60 pb-3">
          {[72, 64, 80, 60].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${w}px` }} />
          ))}
        </div>
      </div>

      {/* Overview body */}
      <section className="mt-6 px-4 sm:px-6">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </section>
    </main>
  )
}
