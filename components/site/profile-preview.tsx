"use client"

import Image from "next/image"
import { createContext, useContext, useMemo, useState } from "react"
import { resolveBanner } from "@/lib/profile/banners"
import { resolveEarnedFlairs, type FlairId } from "@/lib/profile/flair"
import { cn } from "@/lib/utils"
import { useFlairCatalogue } from "./flair-catalogue"
import { InfoTip } from "./info-tip"

export interface PreviewSkinValue {
  src: string
  name: string
}

/**
 * A favourite legend as the header draws it.
 *
 * Resolved names and slugs rather than roster ids, and that is the whole point:
 * whoever holds the ids needs `LEGEND_ROSTER` to turn them into art, and the
 * customizer already carries it. Passing ids instead would put all seventy
 * legends into the bundle of every visitor who opens a profile, to serve a
 * preview only the owner can ever trigger.
 */
export interface PreviewLegend {
  name: string
  slug: string
}

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
  /**
   * Pending favourite skin.
   *
   * Three states, not two, and the third is the reason this isn't just
   * `Value | null`: `undefined` means "nothing pending, show the saved one",
   * while `null` means "pending: no skin at all". Collapsing them would make
   * clearing your skin the one change the preview could not show — the card
   * would keep the old art until you saved and reloaded, which is exactly the
   * moment you most want to see the result.
   */
  skin: PreviewSkinValue | null | undefined
  /** Pending favourite legends, or null for "show the saved ones". */
  favoriteLegends: PreviewLegend[] | null
  setBannerId: (id: string | null) => void
  setFlairId: (id: string | null) => void
  setSkin: (skin: PreviewSkinValue | null | undefined) => void
  setFavoriteLegends: (legends: PreviewLegend[] | null) => void
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
  const [skin, setSkin] = useState<PreviewSkinValue | null | undefined>(
    undefined
  )
  const [favoriteLegends, setFavoriteLegends] = useState<
    PreviewLegend[] | null
  >(null)
  const value = useMemo<PreviewState>(
    () => ({
      bannerId,
      flairId,
      skin,
      favoriteLegends,
      setBannerId,
      setFlairId,
      setSkin,
      setFavoriteLegends,
      reset: () => {
        setBannerId(null)
        setFlairId(null)
        setSkin(undefined)
        setFavoriteLegends(null)
      },
    }),
    [bannerId, flairId, skin, favoriteLegends]
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
        resolveBanner(id).wash
      )}
    />
  )
}

/**
 * The favourite skin behind the name, showing the pending pick when there is
 * one.
 *
 * Anchored to the right half, clear of the name and tags, faded out below its
 * midpoint so the lower half dissolves into the card instead of ending on a
 * hard edge, and dropped to a wash so the name and tags keep their contrast.
 * Hidden on phones, where there is no room beside the content for it to be a
 * backdrop rather than clutter.
 *
 * `unoptimized`, like everything else here — the src is a wiki thumbnail
 * already sized for this, and routing an unsaved third-party URL through the
 * optimizer would make a preview depend on a network round-trip through our own
 * server before it could show you what you just clicked.
 */
export function PreviewSkin({ saved }: { saved: PreviewSkinValue | null }) {
  const preview = useProfilePreview()
  // `undefined` means nothing pending; `null` means pending-none. Only the
  // first falls through to the saved value.
  const skin = preview?.skin === undefined ? saved : preview.skin
  if (!skin?.src) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden rounded-2xl sm:block"
    >
      <Image
        // Keyed by src so swapping skins remounts the element rather than
        // letting the browser paint the new art into the old one's box.
        key={skin.src}
        src={skin.src}
        alt=""
        width={364}
        height={323}
        unoptimized
        className="absolute -top-10 right-4 h-[210%] w-auto max-w-none object-contain object-top opacity-[0.22] select-none"
        style={{
          // Two masks, intersected: the vertical one dissolves the lower half
          // into the card, the horizontal one fades the figure out before it
          // reaches the name and tags on the left. Webkit needs its own
          // prefixed pair.
          maskImage: "linear-gradient(to bottom, black 0%, black 34%, transparent 66%), linear-gradient(to left, black 45%, transparent 95%)",
          maskComposite: "intersect",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 34%, transparent 66%), linear-gradient(to left, black 45%, transparent 95%)",
          WebkitMaskComposite: "source-in",
        }}
      />
    </div>
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
  const catalogue = useFlairCatalogue()
  const selected = preview?.flairId ?? savedId
  const flairs = resolveEarnedFlairs(selected, earned, catalogue)
  if (flairs.length === 0) return null
  // A fragment, not a wrapper: this sits inside a flex row that already sets
  // the gap beside the name, and an element around the group would change that
  // spacing on a profile that only ever draws one badge.
  return (
    <>
      {flairs.map((flair) => (
        <InfoTip key={flair.id} label={flair.label}>
          {/* No chip around it: the art is already a bounded object, and a
              frame only made it read as one more tag in a row of tags. */}
          <span className="inline-flex shrink-0 items-center">
            <Image
              src={flair.src}
              alt={flair.label}
              width={flair.width}
              height={flair.height}
              unoptimized
              className={cn("w-auto object-contain select-none", className)}
            />
          </span>
        </InfoTip>
      ))}
    </>
  )
}
