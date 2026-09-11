import {
  ControlRowSkeleton,
  PageSkeleton,
  PodiumSkeleton,
  TableSkeleton,
} from "@/components/site/skeletons"

/**
 * Leaderboard loading state. The ladder render waits on the Brawlhalla API,
 * the player cache and the Valhallan cutoffs, so a region or page click used
 * to leave the old board on screen with no acknowledgement. Mirrors the real
 * geometry: control row → podium → 50-row table.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton widths={[220, 210, 150, 90, 330]} />
      <PodiumSkeleton />
      <TableSkeleton rows={12} />
    </PageSkeleton>
  )
}
