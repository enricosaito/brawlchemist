"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * InfoTip — the app's one tooltip.
 *
 * Wraps the Radix/shadcn primitives so a call site stays the one line a
 * `title` attribute used to be. Replacing `title` buys a styled, instantly
 * shown, screen-reader-addressable tooltip instead of the browser's ~1s
 * delayed native one — but it is a client boundary, so it belongs on the
 * things worth explaining, not on every element that could carry a hint.
 *
 * `asChild` keeps the trigger as whatever it wraps: no extra wrapper element,
 * so this can drop into a flex row or a truncating span without changing the
 * layout around it.
 *
 * Touch has no hover, here as with `title` — so anything essential still has
 * to be readable without it.
 */
export function InfoTip({
  label,
  side = "bottom",
  children,
}: {
  /** Tooltip content. Short — this is a hint, not a panel. */
  label: React.ReactNode
  /**
   * Below by default. These hang off tags and stat rows that sit near the top
   * of a card, where a tooltip above would cover the thing it explains — and
   * on the profile header, the row above is usually the player's name.
   */
  side?: "top" | "right" | "bottom" | "left"
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
