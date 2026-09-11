import {
  CardGridSkeleton,
  ControlRowSkeleton,
  PageSkeleton,
} from "@/components/site/skeletons"

/** Filter row + the event card grid. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ControlRowSkeleton widths={[180, 240, 140]} />
      <CardGridSkeleton count={9} height="h-52" />
    </PageSkeleton>
  )
}
