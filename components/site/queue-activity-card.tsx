import { Clock } from "lucide-react"
import { QueueActivityChart } from "@/components/site/queue-activity-chart"
import { getQueueActivity } from "@/lib/sync/queue-activity"
import type { LiveQueue } from "@/lib/sync/live"

/**
 * "When the queue is busiest" — the hourly activity curve under the live grid.
 *
 * Below a day of samples the curve is noise, so the card shows a labelled
 * preview instead of a real-looking line drawn from three data points. The
 * collection itself costs nothing (the live cron already computes the numbers),
 * so the honest move is to let it accumulate in the background and say so.
 */

/** Below this many polls the shape isn't worth drawing as fact. */
const MIN_SAMPLES = 288

export async function QueueActivityCard({
  queue,
  region,
}: {
  queue: LiveQueue
  region: string
}) {
  const activity = await getQueueActivity({ queue, region })
  const preview = activity.samples < MIN_SAMPLES

  return (
    <section className="mx-auto mt-6 max-w-[1280px]">
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
            <Clock className="size-3.5 text-muted-foreground" />
            When the queue is busiest
          </h2>
          {preview ? (
            <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-copper">
              Preview · collecting
            </span>
          ) : (
            <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Last {activity.days}d · your local time
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {preview
              ? "Sample shape — real data starts now"
              : `${activity.samples.toLocaleString()} polls`}
          </span>
        </div>

        <QueueActivityChart hours={activity.hours} preview={preview} />

        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          {preview
            ? "This chart fills in as the live poll runs — it reads the ladder every 5 minutes and records how many tracked players finished a match. Nothing here is measured yet."
            : "Average players finishing a match per 5-minute poll, across the tracked top of the ladder — not the whole playerbase."}
        </p>
      </div>
    </section>
  )
}
