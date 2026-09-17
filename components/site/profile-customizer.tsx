"use client"

import Image from "next/image"
import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { BadgeCheck, Check, Loader2, Lock, Sparkles, X } from "lucide-react"
import {
  saveBannerAction,
  saveFavoriteSkinAction,
  saveFlairAction,
  saveProfileFieldsAction,
} from "@/app/account/actions"
import { SkinPicker } from "./skin-picker"
import { BANNER_PRESETS, DEFAULT_BANNER_ID } from "@/lib/profile/banners"
import {
  autoFlairId,
  FLAIR_NONE,
  selectableFlairs,
  type FlairId,
} from "@/lib/profile/flair"
import { ACHIEVEMENTS } from "@/lib/profile/achievements"
import { toastAchievement, toastSaved } from "./unlock-toast"
import { useFlairCatalogue } from "./flair-catalogue"
import { InfoTip } from "./info-tip"
import {
  SOCIAL_KINDS,
  SOCIAL_META,
  type SocialKind,
  type SocialLink,
} from "@/lib/profile/social"
import { LEGEND_ROSTER } from "@/lib/legends-roster"
import { cn } from "@/lib/utils"
import { useProfilePreview } from "./profile-preview"

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
  initialFavoriteSkin,
  mainLegendName,
  isPro,
  inline = false,
  doneHref,
}: {
  brawlhallaId: number
  initialBannerId: string | null
  initialFlairId: string | null
  /** Flair the player has actually earned; the rest render locked. */
  earnedFlairIds: FlairId[]
  initialBio: string | null
  initialSocialLinks: SocialLink[]
  initialFavoriteLegendIds: number[]
  /** The stored favorite skin, as { src, name } — see lib/skins.ts. */
  initialFavoriteSkin: { src: string; name: string } | null
  /** Opens the picker on the legend they actually play. */
  mainLegendName?: string | null
  /** Verified pro. Gates the free-text and outbound-link fields. */
  isPro: boolean
  /**
   * Render as a page section instead of a floating panel.
   *
   * Inline is how this is reached now: the profile header is the trigger, and
   * clicking it swaps the page body for this. The floating mode is kept — it
   * costs one branch, and the sections are identical either way.
   */
  inline?: boolean
  /** Where "Done" goes — the profile this edits. */
  doneHref?: string
}) {
  const router = useRouter()
  // Null when this renders outside a profile page (the floating mode on a
  // surface that has no header to preview onto).
  const preview = useProfilePreview()
  // Every badge that exists, including ones this player hasn't earned — the
  // picker shows those locked on purpose, since a badge nobody can see isn't
  // worth chasing. Entitlement still arrives separately, computed server-side.
  const catalogue = useFlairCatalogue()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const [bannerId, setBannerId] = useState(initialBannerId ?? DEFAULT_BANNER_ID)
  const [flairId, setFlairId] = useState(initialFlairId)
  const [skin, setSkin] = useState(initialFavoriteSkin)

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

  // Every control below is local state. Nothing reaches the database until
  // Save, which is the whole point of the change: banner and flair used to
  // persist on click, so trying three backgrounds wrote three rows and there
  // was no way to back out of a choice you had already made. One commit, one
  // undo.
  function pickBanner(id: string) {
    if (pending) return
    setError(null)
    setSaved(false)
    setBannerId(id)
    // Show it on the card above immediately. Local only — see
    // ProfilePreviewProvider.
    preview?.setBannerId(id)
  }

  function pickFlair(id: string) {
    if (pending) return
    setError(null)
    setSaved(false)
    setFlairId(id)
    preview?.setFlairId(id)
  }

  /** The form as the server wants it. */
  function currentFields() {
    return {
      bio,
      socialLinks: SOCIAL_KINDS.map((kind) => ({
        kind,
        url: links[kind].trim(),
      })).filter((l) => l.url.length > 0),
      favoriteLegendIds: favorites
        .map((v) => Number.parseInt(v, 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    }
  }

  const bannerDirty = bannerId !== (initialBannerId ?? DEFAULT_BANNER_ID)
  const flairDirty = flairId !== initialFlairId
  // Compared by src: the name rides along with it, so two selections differ
  // exactly when the image does.
  const skinDirty = (skin?.src ?? null) !== (initialFavoriteSkin?.src ?? null)
  const fieldsDirty =
    JSON.stringify(currentFields()) !==
    JSON.stringify({
      bio: initialBio ?? "",
      socialLinks: initialSocialLinks
        .map((l) => ({ kind: l.kind, url: l.url.trim() }))
        .filter((l) => l.url.length > 0),
      favoriteLegendIds: initialFavoriteLegendIds.filter(
        (n) => Number.isInteger(n) && n > 0
      ),
    })
  const dirty = bannerDirty || flairDirty || skinDirty || fieldsDirty

  /**
   * Had they customized anything *before* this session opened the panel?
   *
   * Same five things the achievement's rule tests, read off the initial props
   * rather than asked of the server. The client is the only place that still
   * knows the "before" state once the save lands — and asking the server would
   * mean a round trip to learn something already in hand. A null banner and a
   * null flair are untouched, so opening the panel and changing nothing leaves
   * this false, which is what makes the unlock fire exactly once.
   */
  const wasCustomized =
    !!initialBio ||
    initialSocialLinks.length > 0 ||
    initialFavoriteLegendIds.length > 0 ||
    initialBannerId !== null ||
    initialFlairId !== null

  /**
   * Persist everything that actually changed, in one go.
   *
   * Three actions rather than one because they are three different writes with
   * three different validations on the server, and collapsing them into a new
   * combined action would duplicate rules that already exist. Sequential, not
   * parallel: they all touch the same row, and a partial failure should stop
   * rather than race.
   */
  function saveAll() {
    if (pending) return
    if (!dirty) {
      if (inline && doneHref) router.push(doneHref)
      return
    }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      if (bannerDirty) {
        const res = await saveBannerAction(brawlhallaId, bannerId)
        if (!res.ok) return setError(errorText(res.error))
      }
      if (skinDirty) {
        const res = await saveFavoriteSkinAction(brawlhallaId, skin)
        if (!res.ok) {
          setError(
            res.error === "invalid"
              ? "That skin isn't one we recognise."
              : "Couldn't save your skin."
          )
          return
        }
      }
      if (flairDirty) {
        const res = await saveFlairAction(brawlhallaId, flairId ?? FLAIR_NONE)
        if (!res.ok) return setError(errorText(res.error))
      }
      if (fieldsDirty) {
        const res = await saveProfileFieldsAction(brawlhallaId, currentFields())
        if (!res.ok) return setError(errorText(res.error))
      }
      setSaved(true)
      toastSaved("Profile saved")
      // First time this profile has been customized at all — the moment the
      // achievement is earned, announced from the click that earned it.
      if (!wasCustomized) {
        const def = ACHIEVEMENTS.find((a) => a.id === "customize-profile")
        if (def) toastAchievement(def, brawlhallaId)
      }
      // Deliberately NOT preview.reset() here. The preview holds exactly what
      // was just written, and the server hasn't re-rendered yet — dropping it
      // now flashes the header back to the old banner for the length of a
      // refresh before it snaps to the new one. Leaving it means the two agree
      // the whole way through, and once the refresh lands the preview and the
      // saved value are the same value. Cancel still resets, because there the
      // preview and the server genuinely disagree.
      router.refresh()
      // Back to the profile: you have been watching the result the whole time,
      // so there is nothing left to stay for.
      if (inline && doneHref) router.push(doneHref)
    })
  }

  /** Put every control back to what was loaded. Purely local — nothing to undo
   * on the server, because nothing was written. */
  function cancelChanges() {
    if (pending) return
    setError(null)
    setSaved(false)
    // The card above snaps back to what everyone else sees.
    preview?.reset()
    setBannerId(initialBannerId ?? DEFAULT_BANNER_ID)
    setFlairId(initialFlairId)
    setSkin(initialFavoriteSkin)
    setBio(initialBio ?? "")
    const seed = {} as Record<SocialKind, string>
    for (const kind of SOCIAL_KINDS) seed[kind] = ""
    for (const l of initialSocialLinks) seed[l.kind] = l.url
    setLinks(seed)
    setFavorites(
      Array.from({ length: FAVORITE_SLOTS }, (_, i) =>
        String(initialFavoriteLegendIds[i] ?? "")
      )
    )
  }

  // What the profile is actually showing right now. A null choice means "show
  // my best", so the panel marks that row rather than claiming None and
  // disagreeing with the badge visible behind it.
  const shownFlairId =
    flairId ?? autoFlairId(earnedFlairIds, catalogue) ?? FLAIR_NONE

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

  // The sections, shared by both modes. Inline gets columns and no scroll cap —
  // the point of leaving the 26rem popover is that there is room now — while the
  // floating panel keeps its height limit.
  const sections = (
    <div
      className={
        inline
          ? "grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3"
          : "max-h-[min(70vh,34rem)] space-y-5 overflow-y-auto pr-1"
      }
    >
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
              {bannerId === p.id ? (
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
        <div className="grid grid-cols-3 gap-1.5">
          <FlairTile
            selected={shownFlairId === FLAIR_NONE}
            onSelect={() => pickFlair(FLAIR_NONE)}
            label="None"
          />
          {/* Not the whole catalogue: a badge that follows a role or a linked
            account is derived, so offering it asks a question with one answer
            and implies you could decline it. Those still render — they just
            aren't choices. */}
          {selectableFlairs(catalogue).map((f) => {
            const earned = earnedFlairIds.includes(f.id)
            return (
              <FlairTile
                key={f.id}
                selected={shownFlairId === f.id}
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
                      "h-9 w-auto object-contain select-none",
                      !earned && "opacity-30 grayscale"
                    )}
                  />
                }
              />
            )
          })}
        </div>
      </Section>

      <Section
        label="Favorite skin"
        hint="Shows behind your name. Pick a legend, then a skin."
      >
        <SkinPicker
          value={skin}
          onChange={(next) => {
            setError(null)
            setSaved(false)
            setSkin(next)
          }}
          defaultLegend={mainLegendName}
        />
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
  )

  const saveBar = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
      <span
        className={cn(
          "min-w-0 truncate text-xs",
          error
            ? "text-negative"
            : saved
              ? "text-positive"
              : "text-muted-foreground"
        )}
      >
        {error ?? (saved ? "Saved." : dirty ? "Unsaved changes." : "")}
      </span>
      <div className="flex items-center gap-2">
        {/* Only offered when there is something to undo — an always-present
            Cancel on a clean form reads as a way out of the editor, which is
            what Done is for. */}
        {dirty && (
          <button
            type="button"
            onClick={cancelChanges}
            disabled={pending}
            className="inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            Cancel changes
          </button>
        )}
        <button
          type="button"
          onClick={saveAll}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-pink/50 bg-pink/10 px-3 py-1.5 text-xs font-semibold text-pink transition-colors hover:bg-pink/20 disabled:opacity-40"
        >
          {pending && <Loader2 className="size-3 animate-spin" />}
          Save changes
        </button>
      </div>
    </div>
  )

  // Inline: a page section, not a dialog. No trigger and no portal — the header
  // above is the trigger, and there is no stacking context to escape.
  if (inline) {
    return (
      <section className="mt-8 px-4 sm:px-6">
        <div className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-pink" />
            <h2 className="font-display text-lg font-semibold">Edit profile</h2>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Only you can see this
            </span>
          </div>
          {sections}
          {saveBar}
        </div>
      </section>
    )
  }

  // No mounted-guard needed for the portal: the panel only opens on a click,
  // so this branch is never reached during SSR.
  if (!open || typeof document === "undefined") return trigger

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
          {sections}
          {saveBar}
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
 * One flair, as a square.
 *
 * A grid rather than a list because a flair is chosen by its art, and a row
 * puts a 20px thumbnail beside a line of text — which makes the label the thing
 * you read and the badge the thing you skim. Square tiles put the art at the
 * size you will actually wear it and let the eye compare a set at a glance.
 *
 * The name moves to the tooltip with it. At three tiles across a third of the
 * panel there is room for about five characters, and "Braw…" twice over is
 * worse than no label at all — it cannot tell Brawlchemist Developer from
 * Brawlchemist User, which are exactly the two a developer has to choose
 * between. The art is the thing being picked; the accessible name still carries
 * the full text.
 *
 * "None" is the exception and keeps its label, because it has no art to be.
 */
function FlairTile({
  selected,
  locked = false,
  onSelect,
  label,
  sub,
  art,
}: {
  selected: boolean
  locked?: boolean
  onSelect: () => void
  label: string
  sub?: string
  art?: React.ReactNode
}) {
  return (
    <InfoTip label={sub ? `${label} — ${sub}` : label}>
      <button
        type="button"
        onClick={onSelect}
        disabled={locked}
        aria-pressed={selected}
        aria-label={sub ? `${label}. ${sub}` : label}
        className={cn(
          "relative flex aspect-square w-full items-center justify-center rounded-lg border p-1.5 transition-colors",
          selected
            ? "border-pink/60 bg-pink/10"
            : "border-border/60 bg-card/40 hover:border-foreground/30",
          locked && "cursor-not-allowed opacity-70 hover:border-border/60"
        )}
      >
        {art ? (
          <span className="flex h-9 items-center justify-center">{art}</span>
        ) : (
          <span className="text-[11px] font-semibold">{label}</span>
        )}
        {locked ? (
          <Lock className="absolute top-1 right-1 size-3 text-muted-foreground" />
        ) : selected ? (
          <Check className="absolute top-1 right-1 size-3.5 text-pink" />
        ) : null}
      </button>
    </InfoTip>
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
