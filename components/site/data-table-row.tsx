"use client"

import { useRouter } from "next/navigation"
import { PlayerContextMenu } from "./player-link"
import { cn } from "@/lib/utils"

/**
 * A leaderboard row you can click anywhere on, and right-click anywhere on.
 *
 * A table row can't be wrapped in a link — `<tr><a>` isn't valid HTML and the
 * browser will unpick it — and an absolutely positioned overlay inside a cell
 * is unreliable across browsers, because `position: relative` on `<tr>` isn't
 * dependable. So the row navigates on click instead, and the real anchor stays
 * on the name for keyboard users, middle-click and "copy link address".
 *
 * Clicks that land on something interactive are left alone: a nested link
 * (a legend chip, a teammate) means what it says, and a text selection is not
 * a click. Right-click gets the same player menu the name has, which is the
 * point — a menu that only appears over the four characters of a short name is
 * a menu most people never discover.
 */
export function DataTableRow({
  playerId,
  href,
  className,
  children,
  ...rest
}: {
  /** Player this row is about; null disables both behaviours. */
  playerId: number | null
  href: string | null
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLTableRowElement>) {
  const router = useRouter()

  function onClick(e: React.MouseEvent<HTMLTableRowElement>) {
    if (!href) return
    // Let nested interactive elements win, and don't hijack modified clicks
    // (new tab / new window) or the tail end of a drag-selection.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("a, button, input, select, textarea, [role='menuitem']")) {
      return
    }
    if (window.getSelection()?.toString()) return
    router.push(href)
  }

  const row = (
    <tr
      {...rest}
      onClick={onClick}
      className={cn(href && "cursor-pointer", className)}
    >
      {children}
    </tr>
  )

  if (playerId == null) return row
  return <PlayerContextMenu id={playerId}>{row}</PlayerContextMenu>
}
