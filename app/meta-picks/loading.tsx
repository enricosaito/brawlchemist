import {
  ControlRowSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/site/skeletons"

/** Control row + table, matching the real /legends layout. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton />
      <TableSkeleton rows={12} />
    </PageSkeleton>
  )
}
