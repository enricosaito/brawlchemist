"use client"

import type React from "react"

import { Chart } from "@/components/chart"
import { formatElo } from "@/lib/format"

/**
 * Client boundary for the rating trend.
 *
 * RatingHistoryCard is a Server Component, so it can't hand `Chart` a
 * `formatValue` closure — functions don't serialise across the boundary. This
 * owns the formatting (and the tier-tinted fill) and takes only plain data, so
 * the server side stays a pure data fetch.
 */
export function RatingTrendChart({
  ratings,
  labels,
  color,
}: {
  ratings: number[]
  labels: string[]
  /** CSS colour for the line — the player's current tier token. */
  color: string
}) {
  return (
    <div
      // Tint the area fill with the same tier colour instead of the component's
      // default grey, so the line and its wash read as one object.
      //
      // Set inline rather than through className: Chart declares
      // `dark:[--spell-badge:#2d2d2d]`, and that dark-variant selector outranks
      // an unprefixed utility no matter what order tailwind-merge puts them in.
      // An inline custom property sits above both and inherits down.
      style={
        {
          "--spell-badge":
            "color-mix(in oklab, var(--spell-color) 34%, transparent)",
        } as React.CSSProperties
      }
    >
      <Chart
        data={ratings}
        labels={labels}
        name="Rating"
        color={color}
        formatValue={(v) => `${formatElo(v)} ELO`}
        width={1280}
        className="w-full"
      />
    </div>
  )
}
