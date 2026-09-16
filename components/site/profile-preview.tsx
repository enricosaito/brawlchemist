"use client"

import Image from "next/image"
import { createContext, useContext, useMemo, useState } from "react"
import { resolveBanner } from "@/lib/profile/banners"
import {
  autoFlairId,
  flairById,
  FLAIR_NONE,
  type FlairId,
} from "@/lib/profile/flair"
import { cn } from "@/lib/utils"
import { InfoTip } from "./info-tip"

/**
 * Live preview of unsaved customizer choices, on the header the choices are
 * about.
 *
 * The editor holds every change locally until Save, which is what makes Cancel
 * possible — but it also means the header above stops reflecting what you are
 * doing, and a banner is exactly the kind of thing you cannot judge from a
 * 32px swatch. This puts the pending value back on the card without writing
 * it: the preview is client state, the database still only hears about it on
 * Save.
 *
 * So there are two truths on screen at once and they must not be confused. The
 * server-rendered value is what everyone else sees. The preview is what *you*
 * would see if you saved. Cancel drops the preview and the card snaps back to
 * the first; Save writes the second and the refresh makes them agree.
 */
interface PreviewState {
  /** Pending banner, or null for "show the saved one". */
  bannerId: string | null
  /** Pending flair selection, or null for "show the saved one". */
  flairId: string | null
  setBannerId: (id: string | null) => void
  setFlairId: (id: string | null) => void
  /** Drop every pending value — Cancel, and after a save has landed. */
  reset: () => void
}

const Ctx = createContext<PreviewState | null>(null)

/**
 * Wraps the header and the editor together, because it is the only thing they
 * share. Rendered unconditionally: it holds no state until an editor pushes
 * some, so a visitor pays one empty provider.
 */
export function ProfilePreviewProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [bannerId, setBannerId] = useState<string | null>(null)
  const [flairId, setFlairId] = useState<string | null>(null)
  const value = useMemo<PreviewState>(
    () => ({
      bannerId,
      flairId,
      setBannerId,
      setFlairId,
      reset: () => {
        setBannerId(null)
        setFlairId(null)
      },
    }),
    [bannerId, flairId],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Null outside a provider, so nothing here is required to be wrapped. */
export function useProfilePreview(): PreviewState | null {
  return useContext(Ctx)
}

/**
 * The header's ambient wash, showing the pending banner when there is one.
 *
 * A client component for one div, so the rest of the header stays server-
 * rendered — the preview only needs to reach the thing it changes.
 */
export function PreviewBannerWash({ savedId }: { savedId: string | null }) {
  const preview = useProfilePreview()
  const id = preview?.bannerId ?? savedId
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-2xl transition-opacity",
        resolveBanner(id).wash,
      )}
    />
  )
}

/**
 * The flair beside the name, showing the pending choice when there is one.
 *
 * Takes the earned list rather than a resolved flair so it can re-run the same
 * rule the server does: a selection is only honoured while it is held, and an
 * unset choice falls back to the best earned one. Re-deriving here rather than
 * trusting the editor keeps the preview honest — it cannot show a badge the
 * profile wouldn't.
 */
export function PreviewFlair({
  savedId,
  earned,
  className = "h-8",
}: {
  savedId: string | null
  earned: FlairId[]
  className?: string
}) {
  const preview = useProfilePreview()
  const selected = preview?.flairId ?? savedId
  if (selected === FLAIR_NONE) return null
  const id =
    selected && earned.includes(selected as FlairId)
      ? (selected as FlairId)
      : autoFlairId(earned)
  const flair = id ? flairById(id) : null
  if (!flair) return null
  return (
    <InfoTip label={flair.label}>
      {/* No chip around it: the art is already a bounded object, and a frame
          only made it read as one more tag in a row of tags. */}
      <span className="inline-flex shrink-0 items-center">
        <Image
          src={flair.src}
          alt={flair.label}
          width={flair.width}
          height={flair.height}
          unoptimized
          className={cn("w-auto select-none object-contain", className)}
        />
      </span>
    </InfoTip>
  )
}
