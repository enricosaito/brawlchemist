"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * LiveAutoRefresh — periodically re-runs the server component so the live feed
 * stays current without a heavy client. Pauses while the tab is hidden to avoid
 * needless fetches. The page is `force-dynamic`, so each refresh re-queries the
 * (cron-updated) snapshot.
 */
export function LiveAutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
