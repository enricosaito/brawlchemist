"use client"

import { useEffect, useState } from "react"

/**
 * LiveCountBadge — polls the count of players active right now and shows it as
 * a compact "LIVE - N" chip on the Ranked Queue nav item (tooltip spells out
 * "N playing now"). Hidden when zero/unknown so the rail stays clean off-peak.
 * Pauses while the tab is hidden.
 */
export function LiveCountBadge() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== "visible") return
      fetch("/api/live/count")
        .then((r) => r.json())
        .then((d) => {
          if (alive) setCount(typeof d.count === "number" ? d.count : null)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!count) return null

  return (
    <span
      title={`${count} playing now`}
      // Narrow rails (md–lg) hide the chip so the label never truncates — the
      // pulsing avatar dot still signals live there. Mobile drawer is wide
      // enough, so only the md-to-xl band hides it.
      className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-negative/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-negative md:max-xl:hidden"
    >
      LIVE - {count}
    </span>
  )
}
