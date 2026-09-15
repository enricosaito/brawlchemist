"use client"

import Image from "next/image"
import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { BadgeCheck, Check, Loader2, Lock, Sparkles, X } from "lucide-react"
import {
  saveBannerAction,
  saveFlairAction,
  saveProfileFieldsAction,
} from "@/app/account/actions"
import { BANNER_PRESETS, DEFAULT_BANNER_ID } from "@/lib/profile/banners"
import {
  autoFlairId,
  FLAIRS,
  FLAIR_NONE,
  type FlairId,
} from "@/lib/profile/flair"
import {
  SOCIAL_KINDS,
  SOCIAL_META,
  type SocialKind,
  type SocialLink,
} from "@/lib/profile/social"
import { LEGEND_ROSTER } from "@/lib/legends-roster"
import { cn } from "@/lib/utils"

// Alphabetical, because a picker is a lookup: roster order is release order,
// which tells you nothing when you are hunting for one name.
const LEGEND_OPTIONS = [...LEGEND_ROSTER].sort((a, b) =>
  a.name.localeCompare(b.name)
)

const BIO_MAX = 280
const FAVORITE_SLOTS = 3

function errorText(error?: "auth" | "forbidden" | "save"): string {
  return error === "forbidden"
    ? "You can only edit your own profile."
    : error === "auth"
      ? "Please sign in again."
      : "Couldn't save. Try again."
}

/**
 * ProfileCustomizer — one panel for everything an owner can set about their
 * profile, opened from the header of the profile it edits.
 *
 * Editing happens over the thing being edited rather than on a settings page,
 * because every axis here is visual: a banner wash, a badge, a quote. Choosing
 * them against a preview of someone else's idea of your page is guesswork.
 * Banner and flair save on click and refresh in place, so the header behind the
 * panel updates as you pick; the text fields save together on submit, because
 * a half-typed bio is not a preference yet.
 *
 * The server actions are the authority — this is only the UI half, and the
 * server wrapper sends it to nobody but the owner.
 */
export function ProfileCustomizer({
  brawlhallaId,
  initialBannerId,
  initialFlairId,
  earnedFlairIds,
  initialBio,
  initialSocialLinks,
  initialFavoriteLegendIds,
  isPro,
}: {
  brawlhallaId: number
  initialBannerId: string | null
  initialFlairId: string | null
  /** Flair the player has actually earned; the rest render locked. */
  earnedFlairIds: FlairId[]
  initialBio: string | null
  initialSocialLinks: SocialLink[]
  initialFavoriteLegendIds: number[]
  /** Verified pro. Gates the free-text and outbound-link fields. */
  isPro: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const [bannerId, setBannerId] = useState(initialBannerId ?? DEFAULT_BANNER_ID)
  const [flairId, setFlairId] = useState(initialFlairId)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [bio, setBio] = useState(initialBio ?? "")
  const [links, setLinks] = useState<Record<SocialKind, string>>(() => {
    const seed = {} as Record<SocialKind, string>
    for (const kind of SOCIAL_KINDS) seed[kind] = ""
    for (const l of initialSocialLinks) seed[l.kind] = l.url
    return seed
  })
  const [favorites, setFavorites] = useState<string[]>(() =>
    Array.from({ length: FAVORITE_SLOTS }, (_, i) =>
      String(initialFavoriteLegendIds[i] ?? "")
    )
  )

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Close on Escape. No outside-click close: this panel holds half-typed text,
  // and losing a bio to a stray click is a worse failure than an extra click to
  // dismiss.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function pickBanner(id: string) {
    if (pending || id === bannerId) return
    setError(null)
    setSavingId(`banner:${id}`)
    const previous = bannerId
    setBannerId(id)
    startTransition(async () => {
      const res = await saveBannerAction(brawlhallaId, id)
      setSavingId(null)
      if (!res.ok) {
        setBannerId(previous)
        setError(errorText(res.error))
        return
      }
      router.refresh()
    })
  }

  function pickFlair(id: string) {
    if (pending || id === shownFlairId) return
    setError(null)
    setSavingId(`flair:${id}`)
    const previous = flairId
    setFlairId(id)
    startTransition(async () => {
      const res = await saveFlairAction(brawlhallaId, id)
      setSavingId(null)
      if (!res.ok) {
        setFlairId(previous)
        setError(errorText(res.error))
        return
      }
      router.refresh()
    })
  }

  function saveFields() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const socialLinks: SocialLink[] = SOCIAL_KINDS.map((kind) => ({
        kind,
        url: links[kind].trim(),
      })).filter((l) => l.url.length > 0)
      const favoriteLegendIds = favorites
        .map((v) => Number.parseInt(v, 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      const res = await saveProfileFieldsAction(brawlhallaId, {
        bio,
        socialLinks,
        favoriteLegendIds,
      })
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  // What the profile is actually showing right now. A null choice means "show
  // my best", so the panel marks that row rather than claiming None and
  // disagreeing with the badge visible behind it.
  const shownFlairId = flairId ?? autoFlairId(earnedFlairIds) ?? FLAIR_NONE

  const bioLeft = BIO_MAX - bio.length

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase backdrop-blur-sm transition-colors",
        open
          ? "border-pink/50 bg-pink/10 text-pink"
          : "border-border/60 bg-card/60 text-muted-foreground hover:border-pink/50 hover:text-pink"
      )}
    >
      <Sparkles className="size-3" />
      Customize
    </button>
  )

  // No mounted-guard needed for the portal: the panel only opens on a click,
  // so this branch is never reached during SSR.
  if (!open || typeof document === "undefined") return trigger

  // Portalled to the body. The slot that holds the trigger is itself a
  // positioned, z-indexed corner of the header card, so anything rendered in
  // place is trapped in that stacking context and later sections paint over it
  // — no z-index on the panel can win an argument it is not part of. Fixed
  // rather than anchored, and floated right, so the name, tags and banner stay
  // visible on the left while you change them.
  return (
    <>
      {trigger}
      {createPortal(
        <div
          ref={panelRef}
          className="fixed top-20 right-3 z-50 w-[min(92vw,26rem)] rounded-2xl border border-border/60 bg-card p-4 text-left shadow-2xl sm:right-6"
          role="dialog"
          aria-label="Customize profile"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Customize</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[min(70vh,34rem)] space-y-5 overflow-y-auto pr-1">
            <Section label="Background">
              <div className="grid grid-cols-5 gap-2">
                {BANNER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.label}
                    onClick={() => pickBanner(p.id)}
                    className={cn(
                      "relative h-8 rounded-md border transition-all",
                      p.swatch,
                      bannerId === p.id
                        ? "border-foreground/70 ring-1 ring-foreground/30"
                        : "border-border/60 hover:border-foreground/40"
                    )}
                  >
                    {savingId === `banner:${p.id}` ? (
                      <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-foreground" />
                    ) : bannerId === p.id ? (
                      <Check className="absolute inset-0 m-auto size-3.5 text-foreground drop-shadow" />
                    ) : null}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              label="Flair"
              hint="Earned, not chosen — pick which one you fly."
            >
              <div className="space-y-1.5">
                <FlairRow
                  selected={shownFlairId === FLAIR_NONE}
                  saving={savingId === `flair:${FLAIR_NONE}`}
                  onSelect={() => pickFlair(FLAIR_NONE)}
                  label="None"
                />
                {FLAIRS.map((f) => {
                  const earned = earnedFlairIds.includes(f.id)
                  return (
                    <FlairRow
                      key={f.id}
                      selected={shownFlairId === f.id}
                      saving={savingId === `flair:${f.id}`}
                      locked={!earned}
                      onSelect={() => earned && pickFlair(f.id)}
                      label={f.label}
                      sub={earned ? undefined : f.requirement}
                      art={
                        <Image
                          src={f.src}
                          alt=""
                          width={f.width}
                          height={f.height}
                          unoptimized
                          className={cn(
                            "h-5 w-auto object-contain select-none",
                            !earned && "opacity-30 grayscale"
                          )}
                        />
                      }
                    />
                  )
                })}
              </div>
            </Section>

            {/* Verified pros only, for now: free text and outbound links on a
            public page stay with the accounts we have vetted. The server
            action refuses these for everyone else regardless of what the
            panel shows — this is the UI half. */}
            {isPro ? (
              <>
                <Section label="Quote" hint={`${bioLeft} left`}>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                    rows={3}
                    placeholder="Say something about yourself."
                    className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-2.5 py-2 text-sm transition-colors outline-none focus:border-pink/60"
                  />
                </Section>

                <Section label="Favorite legends">
                  <div className="grid grid-cols-3 gap-2">
                    {favorites.map((value, i) => (
                      <select
                        key={i}
                        value={value}
                        onChange={(e) => {
                          const next = [...favorites]
                          next[i] = e.target.value
                          setFavorites(next)
                        }}
                        className="min-w-0 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-xs transition-colors outline-none focus:border-pink/60"
                      >
                        <option value="">—</option>
                        {LEGEND_OPTIONS.map((o) => (
                          <option key={o.legendId} value={o.legendId}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </Section>

                <Section label="Links" hint="https only">
                  <div className="space-y-1.5">
                    {SOCIAL_KINDS.map((kind) => (
                      <div key={kind} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          {SOCIAL_META[kind].label}
                        </span>
                        <input
                          type="url"
                          value={links[kind]}
                          onChange={(e) =>
                            setLinks({ ...links, [kind]: e.target.value })
                          }
                          placeholder={SOCIAL_META[kind].placeholder}
                          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-xs transition-colors outline-none focus:border-pink/60"
                        />
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            ) : (
              <Section label="Quote, legends and links">
                <Soon
                  label="Pro only"
                  icon={<BadgeCheck className="size-3 shrink-0 text-mystic" />}
                >
                  Available to verified pro players for now.
                </Soon>
              </Section>
            )}

            <Section label="Favorite skin">
              <Soon>Needs a skin catalogue before you can pick one.</Soon>
            </Section>

            <Section label="Name color">
              <Soon>Coming soon.</Soon>
            </Section>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span
              className={cn(
                "min-w-0 truncate text-xs",
                error ? "text-negative" : "text-positive"
              )}
            >
              {error ?? (saved ? "Saved." : "")}
            </span>
            <button
              type="button"
              onClick={saveFields}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-pink/50 bg-pink/10 px-3 py-1.5 text-xs font-semibold text-pink transition-colors hover:bg-pink/20 disabled:opacity-60"
            >
              {pending && <Loader2 className="size-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function Section({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {label}
        </h3>
        {hint && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * A locked row stays visible and says what would unlock it. A badge nobody can
 * see isn't worth chasing, and hiding the section entirely would mean most
 * players never learn flair exists.
 */
function FlairRow({
  selected,
  saving,
  locked = false,
  onSelect,
  label,
  sub,
  art,
}: {
  selected: boolean
  saving: boolean
  locked?: boolean
  onSelect: () => void
  label: string
  sub?: string
  art?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
        selected
          ? "border-pink/50 bg-pink/10"
          : "border-border/60 bg-card/40 hover:border-foreground/30",
        locked && "cursor-not-allowed opacity-70 hover:border-border/60"
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        {art ?? null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{label}</span>
        {sub && (
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      {saving ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : locked ? (
        <Lock className="size-3 shrink-0 text-muted-foreground" />
      ) : selected ? (
        <Check className="size-3.5 shrink-0 text-pink" />
      ) : null}
    </button>
  )
}

/**
 * A section that exists but is closed to you, and says which kind of closed:
 * not built yet, or not yours. Both read better as a stated reason than as an
 * absent section, which just looks like something failed to load.
 */
function Soon({
  label = "Soon",
  icon,
  children,
}: {
  label?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-2.5 py-2">
      {icon ?? <Lock className="size-3 shrink-0 text-muted-foreground" />}
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {children}
      </span>
    </div>
  )
}
