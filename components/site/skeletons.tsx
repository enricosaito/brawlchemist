import { cn } from "@/lib/utils"

/**
 * Route-level loading skeletons.
 *
 * Every data page here is a blocking server render — the DB and the Brawlhalla
 * API both sit on the critical path — and until now a navigation showed the
 * *old* page until the new one was fully ready. Nothing acknowledged the click.
 * These skeletons are what `loading.tsx` renders in that gap.
 *
 * Two rules they follow:
 *
 *   1. Match the real layout's geometry (same paddings, max-width, row height,
 *      column count) so the swap to real content is a crossfade, not a jump.
 *   2. Stay quiet. Low-contrast blocks with a slow sheen — a loud shimmer at
 *      300ms reads as flicker. Reduced-motion drops the sheen entirely.
 */

/** A single placeholder block. `relative` + `overflow-hidden` host the sheen. */
export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        "animate-skeleton relative overflow-hidden rounded-md bg-muted/40",
        className,
      )}
    />
  )
}

/** The standard inner-page wrapper: same paddings and max-width as the pages. */
export function PageSkeleton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className="pb-16" aria-busy aria-label="Loading">
      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
        <div className={cn("mx-auto max-w-[1280px]", className)}>{children}</div>
      </div>
    </main>
  )
}

/**
 * The filter/tab row that opens most pages (leaderboards, legends, weapons,
 * tournaments). Widths are eyeballed to the real controls so the row doesn't
 * resize under the cursor when it resolves.
 */
export function ControlRowSkeleton({ widths }: { widths?: number[] }) {
  const w = widths ?? [220, 180, 120, 300]
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-3">
      {w.map((px, i) => (
        <Skeleton
          key={i}
          className="h-8 max-w-full"
          style={{ width: `${px}px` }}
        />
      ))}
    </div>
  )
}

/**
 * A table placeholder: sticky-header bar plus N rows at the real row height,
 * inside the real card chrome.
 */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="border-b border-border/60 bg-card px-3 py-2.5">
        <Skeleton className="h-3 w-24" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-t border-border/40 px-3 py-2"
          >
            <Skeleton className="h-3 w-6 shrink-0" />
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-[min(38%,220px)]" />
            <Skeleton className="ml-auto h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The three-up podium above a leaderboard's first page. */
export function PodiumSkeleton() {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  )
}

/** A responsive grid of equal cards — /live, /tournaments, /favorites. */
export function CardGridSkeleton({
  count = 9,
  height = "h-32",
  className,
}: {
  count?: number
  height?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("rounded-2xl", height)} />
      ))}
    </div>
  )
}

/**
 * Home preview-card placeholder. Reproduces PreviewCard's chrome (header bar,
 * six row slots, footer) rather than a blank rectangle, so the launcher grid
 * has its final shape from the first frame and the cards only fill in.
 */
export function PreviewCardSkeleton({
  rows = 6,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <section
      aria-hidden
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60",
        className,
      )}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-6 w-16 rounded-md" />
      </header>
      <div className="grid flex-1 auto-rows-fr divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-[min(50%,140px)]" />
            <Skeleton className="ml-auto h-3.5 w-14 shrink-0" />
          </div>
        ))}
      </div>
      <footer className="border-t border-border/60 px-2 py-1.5">
        <div className="flex justify-center py-1.5">
          <Skeleton className="h-3 w-28" />
        </div>
      </footer>
    </section>
  )
}
