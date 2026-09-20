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
  memberFlair,
  selectableFlairs,
  type FlairId,
} from "@/lib/profile/flair"
import { ACHIEVEMENTS } from "@/lib/profile/achievements"
import { toastAchievement, toastSaved } from "./unlock-toast"
import { useFlairCatalogue } from "./flair-catalogue"
import { InfoTip } from "./info-tip"
import {
  isAllowedSocialUrl,
  SOCIAL_HOSTS,
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

const FAVORITE_SLOTS = 3

/**
 * Links, in one canonical order, from the two places that hold them.
 *
 * The dirty check compares JSON, so order is meaning: the form emitted links in
 * SOCIAL_KINDS order while the baseline used whatever order the row was stored
 * in, and anyone whose stored order differed opened the panel to "Unsaved
 * changes" and a Cancel button before touching anything. Both sides go through
 * the same pair of functions now, so they cannot disagree about order again.
 *
 * It stopped being a curiosity the moment favourite legends left the pro gate:
 * most of the accounts holding links are not pros, and every one of them now
 * has a reason to open this panel.
 */
function seedLinks(list: SocialLink[]): Record<SocialKind, string> {
  const seed = {} as Record<SocialKind, string>
  for (const kind of SOCIAL_KINDS) seed[kind] = ""
  for (const l of list) seed[l.kind] = l.url
  return seed
}

function linksFromMap(map: Record<SocialKind, string>): SocialLink[] {
  return SOCIAL_KINDS.map((kind) => ({ kind, url: map[kind].trim() })).filter(
    (l) => l.url.length > 0
  )
}

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
 * because every axis here is visual: a banner wash, a badge, a skin. Choosing
 * them against a preview of someone else's idea of your page is guesswork.
 * Everything is local until Save, so trying three backgrounds writes nothing
 * until you keep one.
 *
 * The server actions are the authority — this is only the UI half, and the
 * server wrapper sends it to nobody but the owner.
 */
export function ProfileCustomizer({
  brawlhallaId,
  initialBannerId,
  initialFlairId,
  earnedFlairIds,
  initialSocialLinks,
  initialFavoriteLegendIds,
  initialFavoriteSkin,
  mainLegendName,
  tierAllowsLinks,
  isDeveloper = false,
  inline = false,
  doneHref,
}: {
  brawlhallaId: number
  initialBannerId: string | null
  initialFlairId: string | null
  /** Flair the player has actually earned; the rest render locked. */
  earnedFlairIds: FlairId[]
  initialSocialLinks: SocialLink[]
  initialFavoriteLegendIds: number[]
  /** The stored favorite skin, as { src, name } — see lib/skins.ts. */
  initialFavoriteSkin: { src: string; name: string } | null
  /** Opens the picker on the legend they actually play. */
  mainLegendName?: string | null
  /**
   * Their standing allows outbound links. Gates the link fields and nothing
   * else — favourite legends are a choice from a fixed roster, so there is
   * nothing to vet and no reason everyone shouldn't have them.
   *
   * Passed as the resolved capability rather than the tier, because the panel
   * should not be a second place that knows which tiers carry which rights.
   */
  tierAllowsLinks: boolean
  /** Developer role. Links are for people we can hold responsible for them. */
  isDeveloper?: boolean
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

  const [links, setLinks] = useState<Record<SocialKind, string>>(() =>
    seedLinks(initialSocialLinks)
  )
  const [favorites, setFavorites] = useState<string[]>(() =>
    Array.from({ length: FAVORITE_SLOTS }, (_, i) =>
      String(initialFavoriteLegendIds[i] ?? "")
    )
  )

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Close on Escape. No outside-click close: this panel holds unsaved choices,
  // and losing them to a stray click is a worse failure than an extra click to
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

  /**
   * Every control here is local until Save, and every one of them also pushes
   * its pending value onto the card above. The two go together: holding a
   * change locally is what makes Cancel possible, and showing it on the header
   * is what makes the change judgeable. A skin you cannot see until you commit
   * to it is a setting you tune by saving four times.
   *
   * `null` is a real pending value for a skin (cleared), which is why the
   * preview's skin slot is tri-state — see ProfilePreviewProvider.
   */
  function pickSkin(next: { src: string; name: string } | null) {
    if (pending) return
    setError(null)
    setSaved(false)
    setSkin(next)
    preview?.setSkin(next)
  }

  function pickFavorites(next: string[]) {
    if (pending) return
    setError(null)
    setSaved(false)
    setFavorites(next)
    // Resolved here, not in the header: this component already carries the
    // roster for its own <select>, and the header would otherwise have to ship
    // all seventy legends to every visitor to serve a preview only the owner
    // can trigger. An empty slot is an empty string, and an id naming nothing
    // is dropped rather than rendered as a hole.
    preview?.setFavoriteLegends(
      next
        .map((v) => LEGEND_OPTIONS.find((o) => String(o.legendId) === v))
        .filter((o) => !!o)
        .map((o) => ({ name: o.name, slug: o.slug }))
    )
  }

  /** The form as the server wants it. */
  function currentFields() {
    return {
      socialLinks: linksFromMap(links),
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
      socialLinks: linksFromMap(seedLinks(initialSocialLinks)),
      favoriteLegendIds: initialFavoriteLegendIds.filter(
        (n) => Number.isInteger(n) && n > 0
      ),
    })
  const dirty = bannerDirty || flairDirty || skinDirty || fieldsDirty

  /**
   * Had they customized anything *before* this session opened the panel?
   *
   * Same four things the achievement's rule tests, read off the initial props
   * rather than asked of the server. The client is the only place that still
   * knows the "before" state once the save lands — and asking the server would
   * mean a round trip to learn something already in hand. A null banner and a
   * null flair are untouched, so opening the panel and changing nothing leaves
   * this false, which is what makes the unlock fire exactly once.
   */
  const wasCustomized =
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
      let unlocked = false
      if (!wasCustomized) {
        const def = ACHIEVEMENTS.find((a) => a.id === "customize-profile")
        if (def) {
          toastAchievement(def, brawlhallaId)
          unlocked = true
        }
      }
      // Deliberately NOT preview.reset() here. The preview holds exactly what
      // was just written, and the server hasn't re-rendered yet — dropping it
      // now flashes the header back to the old value for the length of a
      // reload before it snaps to the new one. Leaving it means the two agree
      // the whole way through, and the navigation below replaces the tree
      // anyway. Cancel still resets, because there the preview and the server
      // genuinely disagree.
      //
      // A full document load, not router.refresh() + router.push(): those two
      // go through the client router, which serves the profile out of its own
      // RSC cache for the entry it already had, so a save could land and the
      // page you arrived back on still showed the old skin. Reloading is the
      // one thing that cannot disagree with the server, and it costs a page
      // load exactly once per save.
      // ...but not instantly. A document load tears down the toast layer with
      // everything else, and the unlock toast is the one thing on this page
      // that only exists for a moment — announced at the click that earned it,
      // never re-derived on a later render. Navigating the frame after it lands
      // is the difference between an achievement being announced and being
      // silently swallowed by the reload that followed it. The unlock fires
      // once per account ever, so it gets the longer pause.
      const href = inline && doneHref ? doneHref : window.location.href
      window.setTimeout(
        () => window.location.assign(href),
        unlocked ? 2600 : 900
      )
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
    setLinks(seedLinks(initialSocialLinks))
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

  const canEditLinks = tierAllowsLinks || isDeveloper

  /**
   * Links that would not survive the write, named.
   *
   * `parseSocialLinks` drops anything pointing somewhere the kind doesn't
   * name, and a link that vanishes on save with no explanation is how a rule
   * gets read as a bug. Saying it here costs one derived array and turns a
   * silent drop into an instruction.
   */
  const badLinks = SOCIAL_KINDS.filter(
    (kind) =>
      links[kind].trim() && !isAllowedSocialUrl(kind, links[kind].trim())
  )

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
          {/* None turns off the badge you *chose*. It cannot turn off the
            membership badge, which is not a choice — it says this profile
            belongs to an account here. Saying so on the tile is the difference
            between a setting that looks broken and one that is understood. */}
          <FlairTile
            selected={shownFlairId === FLAIR_NONE}
            onSelect={() => pickFlair(FLAIR_NONE)}
            label="None"
            sub={
              memberFlair(catalogue) &&
              earnedFlairIds.includes(memberFlair(catalogue)!.id)
                ? "Keeps your member badge"
                : undefined
            }
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
          onChange={pickSkin}
          defaultLegend={mainLegendName}
        />
      </Section>

      {/* Everyone. A favourite legend is a pick from a fixed roster — there is
            no text to moderate and no link to follow, so there was never
            anything for the pro gate to be protecting. It sat inside that gate
            only because it happened to share a save action with the links. */}
      <Section label="Favorite legends" hint="Up to three">
        <div className="grid grid-cols-3 gap-2">
          {favorites.map((value, i) => (
            <select
              key={i}
              value={value}
              onChange={(e) => {
                const next = [...favorites]
                next[i] = e.target.value
                pickFavorites(next)
              }}
              aria-label={`Favourite legend ${i + 1}`}
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

      {/* Links are the one thing here that puts an outbound URL on a public
            page, so they stay with accounts we can hold responsible for them:
            verified pros and developers. The server action drops them for
            everyone else regardless of what this panel shows — that is the
            half that decides; this is only the UI. */}
      {canEditLinks ? (
        <Section label="Links" hint="the real thing only">
          <div className="space-y-1.5">
            {SOCIAL_KINDS.map((kind) => {
              const value = links[kind].trim()
              const bad = !!value && !isAllowedSocialUrl(kind, value)
              return (
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
                    aria-invalid={bad}
                    placeholder={SOCIAL_META[kind].placeholder}
                    className={cn(
                      "min-w-0 flex-1 rounded-md border bg-background/60 px-2 py-1.5 text-xs transition-colors outline-none",
                      bad
                        ? "border-negative/60 focus:border-negative"
                        : "border-border/60 focus:border-pink/60"
                    )}
                  />
                </div>
              )
            })}
          </div>
          {badLinks.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-negative">
              {badLinks.length === 1
                ? `Your ${SOCIAL_META[badLinks[0]].label} link has to point at ${SOCIAL_HOSTS[badLinks[0]].join(" or ")}.`
                : "Each link has to point at the site it names — they won't be saved otherwise."}
            </p>
          )}
        </Section>
      ) : (
        <Section label="Links">
          <Soon
            label="Pro only"
            icon={<BadgeCheck className="size-3 shrink-0 text-mystic" />}
          >
            Available to verified pro players and above.
          </Soon>
        </Section>
      )}

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
