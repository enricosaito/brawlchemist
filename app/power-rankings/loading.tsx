import {
  CardGridSkeleton,
  ControlRowSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/site/skeletons"

/** Filter row → the three highlight cards → the rankings table. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton widths={[180, 220, 140]} />
      <CardGridSkeleton count={3} height="h-28" className="mb-4" />
      <TableSkeleton rows={10} />
    </PageSkeleton>
  )
}
