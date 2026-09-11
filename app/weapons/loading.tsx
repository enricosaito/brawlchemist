import {
  ControlRowSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/site/skeletons"

/** Control row + table, matching the real /weapons layout. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton />
      <TableSkeleton rows={12} />
    </PageSkeleton>
  )
}
