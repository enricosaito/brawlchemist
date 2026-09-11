"use client"

import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import type { HourBucket } from "@/lib/sync/queue-activity"

/**
 * QueueActivityChart — one vertical bar per hour of the day, showing when the
 * tracked ladder is actually being played.
 *
 * Two details that make it honest rather than decorative:
 *
 * Local time. Buckets are stored and aggregated in UTC, which is useless to a
 * player wondering whether to queue tonight. The series is rotated into the
 * viewer's own timezone, read through useSyncExternalStore — the same pattern
 * the sound toggle uses — so the server snapshot is plain UTC and the client
 * corrects on hydration without a mismatch and without setting state from an
 * effect. The axis says which basis it's on either way.
 *
 * Preview mode. Collection only starts when this ships, so for the first days
 * there's nothing real to draw. Rather than an empty box or — worse — a
 * plausible-looking invention passed off as data, `preview` renders a
 * representative shape in muted, desaturated bars with an explicit label. It
 * should be impossible to mistake for a measurement.
 */

/** A generic evening-peaked curve. Only ever shown behind a "preview" label. */
const PREVIEW_SHAPE = [
  28, 20, 15, 11, 9, 8, 9, 12, 18, 26, 34, 40, 46, 52, 58, 66, 76, 88, 96, 100,
  94, 78, 56, 38,
]

export function QueueActivityChart({
  hours,
  preview = false,
  className,
}: {
  /** 24 entries, hour 0-23 in UTC. Ignored when `preview` is set. */
  hours: HourBucket[]
  preview?: boolean
  className?: string
}) {
  // "<utc offset in hours>:<current local hour>", or "0:-1" on the server.
  // A primitive snapshot keeps the comparison by value, so no render loop.
  const clock = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot,
  )
  const [offsetRaw, hourRaw] = clock.split(":")
  const offsetHours = Number(offsetRaw)
  const nowHour = Number(hourRaw)
  const localised = nowHour >= 0

  const values = preview
    ? PREVIEW_SHAPE
    : hours.length === 24
      ? hours.map((h) => h.active)
      : new Array(24).fill(0)

  // Rotate UTC → local: the bar for local hour h holds UTC hour h - offset.
  const series = Array.from({ length: 24 }, (_, localHour) => {
    const utcHour = (((localHour - offsetHours) % 24) + 24) % 24
    return { localHour, value: values[utcHour] ?? 0 }
  })

  const max = Math.max(...series.map((s) => s.value), 0)
  const peak = max > 0 ? series.reduce((a, b) => (b.value > a.value ? b : a)) : null

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex h-32 items-end gap-[3px] sm:h-40"
        role="img"
        aria-label={
          preview
            ? "Preview of the queue activity chart; no data collected yet"
            : `Queue activity by hour${localised ? ", local time" : ", UTC"}`
        }
      >
        {series.map(({ localHour, value }) => {
          const pct = max > 0 ? (value / max) * 100 : 0
          const isPeak = !preview && peak?.localHour === localHour && max > 0
          const isNow = !preview && nowHour === localHour
          return (
            <div
              key={localHour}
              className="group/bar relative flex h-full min-w-0 flex-1 flex-col justify-end"
              title={
                preview
                  ? undefined
                  : `${String(localHour).padStart(2, "0")}:00 — ${value.toFixed(1)} players in queue on average`
              }
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-[height,opacity] duration-500 ease-out motion-reduce:transition-none",
                  preview
                    ? "bg-muted-foreground/20"
                    : "bg-gradient-to-t from-tier-s/35 via-pink/70 to-pink",
                  isPeak && "shadow-[0_0_14px_-2px_oklch(0.74_0.23_350/0.75)]",
                  !preview && "group-hover/bar:opacity-100",
                  !preview && !isPeak && "opacity-85",
                )}
                // A 2px floor keeps empty hours as a visible baseline tick
                // rather than a gap, so the axis still reads as 24 hours.
                style={{ height: `max(2px, ${pct}%)` }}
              />
              {isNow && (
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-copper"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Axis — every third hour, so it stays legible at phone width. */}
      <div className="mt-2 flex gap-[3px]">
        {series.map(({ localHour }) => (
          <span
            key={localHour}
            className="min-w-0 flex-1 text-center font-mono text-[9px] tabular-nums text-muted-foreground"
          >
            {localHour % 3 === 0 ? String(localHour).padStart(2, "0") : " "}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Timezone offset + current hour, as one primitive snapshot.
 *
 * Neither changes often enough to need a subscription — React re-reads the
 * snapshot on every render, which is more than enough for an hourly axis — so
 * subscribe is a stable no-op. The server snapshot is UTC with no "now" marker,
 * which is exactly what can be rendered without knowing the viewer.
 */
function subscribeClock(): () => void {
  return () => {}
}

function getClockSnapshot(): string {
  const now = new Date()
  return `${-Math.round(now.getTimezoneOffset() / 60)}:${now.getHours()}`
}

function getClockServerSnapshot(): string {
  return "0:-1"
}
