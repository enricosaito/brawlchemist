"use client"

import Image from "next/image"
import { Check } from "lucide-react"
import { Toaster, toast } from "sonner"
import { useTheme } from "next-themes"

/**
 * Unlock toasts — the one moment the site interrupts you, and why.
 *
 * Every toast here is `toast.custom`, so Sonner supplies the portal, the stack
 * and the timers and nothing else: the card is ours, which is what keeps a
 * badge sitting on the site's own glass rather than on a library's default
 * white panel.
 *
 * A badge that appears silently on a page you aren't looking at may as well not
 * exist. These fire at the instant the thing is earned, from the client that
 * performed the action, so the feedback lands on whatever page you were on
 * rather than waiting for you to wander back to your profile.
 *
 * Deliberately not a "you have new achievements" digest computed on render.
 * That needs a seen-set, a diff and a write on somebody's own profile view, and
 * it still tells you about something you did ten minutes ago. Every unlock we
 * have is the direct result of a click, and the client that made the click is
 * the only place that knows it was the *first* one — by the time the write
 * lands, "did they have none before" is gone.
 */

/** Bottom right, per Enrico. Mounted once in the root layout. */
export function UnlockToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      // Sonner renders its own light chrome otherwise, which is a white card on
      // a dark-first product. next-themes is already in the tree for exactly
      // this reason, so the toast follows the same switch as everything else.
      theme={resolvedTheme === "light" ? "light" : "dark"}
    />
  )
}

/** A plain confirmation — no badge, no link. Same card, so toasts match. */
export function toastSaved(message: string) {
  toast.custom(
    () => (
      <div className="flex w-full items-center gap-2.5 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <Check className="size-4 shrink-0 text-positive" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    ),
    { duration: 3000 },
  )
}

interface UnlockArgs {
  /** "Achievement unlocked" / "Flair unlocked" — what kind of thing happened. */
  kind: string
  /** The badge's own name, which is what the person actually cares about. */
  name: string
  src: string
  width: number
  height: number
  /** Where to go to see it. Every unlock has somewhere to look. */
  href: string
  linkLabel: string
}

/**
 * One shape for every unlock, so a second badge can never invent a third look.
 *
 * The art leads, because the badge is the reward and a line of text is not. The
 * action link matters as much: an unlock with nowhere to go is a notification
 * that something happened somewhere, which is the least useful kind.
 */
export function toastUnlock({
  kind,
  name,
  src,
  width,
  height,
  href,
  linkLabel,
}: UnlockArgs) {
  toast.custom(
    (id) => (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <Image
          src={src}
          alt=""
          width={width}
          height={height}
          unoptimized
          className="h-10 w-auto shrink-0 object-contain select-none"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-pink">
            {kind}
          </span>
          <span className="truncate text-sm font-medium">{name}</span>
          {/* A plain <a>, not next/link: this renders in a portal outside the
              router's subtree on some routes, and a full navigation is the
              right behaviour anyway — the page behind is usually the one the
              unlock just made stale. */}
          <a
            href={href}
            onClick={() => toast.dismiss(id)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {linkLabel} →
          </a>
        </div>
      </div>
    ),
    { duration: 6000 },
  )
}

/**
 * An achievement landed. Links to the profile, because that is where the shelf
 * is — there is no separate achievements page, and inventing a link to one
 * would be a promise the site doesn't keep.
 */
export function toastAchievement(
  achievement: { name: string; src: string; width: number; height: number },
  brawlhallaId: number | null,
) {
  toastUnlock({
    kind: "Achievement unlocked",
    name: achievement.name,
    src: achievement.src,
    width: achievement.width,
    height: achievement.height,
    href: brawlhallaId ? `/player/${brawlhallaId}` : "/account",
    linkLabel: brawlhallaId ? "View your profile" : "View your account",
  })
}

/**
 * A flair landed. Links to the customizer rather than the profile: a new flair
 * is a *choice* that just opened up, and the picker is where the choice is
 * made.
 */
export function toastFlair(
  flair: { label: string; src: string; width: number; height: number },
  brawlhallaId: number,
) {
  toastUnlock({
    kind: "Flair unlocked",
    name: flair.label,
    src: flair.src,
    width: flair.width,
    height: flair.height,
    href: `/player/${brawlhallaId}?tab=customize`,
    linkLabel: "Pick your flair",
  })
}
