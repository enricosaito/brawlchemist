"use client"

import { useEffect } from "react"
import { recordVisit } from "@/lib/recent-visits"

/**
 * Invisible client recorder mounted on a profile page. Writes the viewed player
 * to device-local recent visits (localStorage) on mount. Renders nothing. Props
 * are primitives so the effect's deps are exhaustive and it re-records only when
 * the viewed player actually changes.
 */
export function RecentVisitRecorder({
  id,
  username,
  legendSlug,
  rating,
  region,
  pro,
}: {
  id: number
  username: string
  legendSlug: string | null
  rating: number | null
  region: string | null
  pro: boolean
}) {
  useEffect(() => {
    recordVisit({ id, username, legendSlug, rating, region, pro })
  }, [id, username, legendSlug, rating, region, pro])
  return null
}
