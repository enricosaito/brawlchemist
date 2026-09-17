"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import type { SessionUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { AccountControl, type ClaimedProfile } from "./account-control"
import type { FlairContext } from "@/lib/profile/flair"
import { SoundToggle } from "./sound-toggle"
import { DiscordIcon, GithubIcon, XIcon } from "@/components/site/brand-icons"

/* ---------------------------------------------------------------------------
   Nav config — mapped to Brawlchemist's REAL destinations (not the game's
   Play/Battle Pass/Store, which don't exist here). Avatars reuse the existing
   AniAvatar pack already used by the old top-nav dropdowns.
   ------------------------------------------------------------------------- */
interface NavEntry {
  label: string
  href: string
  avatar: string
  /** Prefixes that should mark this entry active (besides exact href). */
  match?: string[]
  /** Renders a pulsing "live" dot on the avatar. */
  live?: boolean
}

const NAV: NavEntry[] = [
  // Home isn't listed — the wordmark/logo is the way back to "/".
  {
    label: "Power Rankings",
    href: "/power-rankings",
    avatar: "/assets/avatars/AniAvatar_Retro_Mjolnir.webp",
  },
  {
    label: "Leaderboards",
    href: "/leaderboards/1v1",
    avatar: "/assets/avatars/AniAvatar_Volkonomicon.webp",
    match: ["/leaderboards"],
  },
  {
    label: "Ranked Queue",
    href: "/queue",
    avatar: "/assets/avatars/AniAvatar_Ash_%26_Yarra.webp",
    live: true,
  },
  {
    label: "Tournaments",
    href: "/tournaments",
    avatar: "/assets/avatars/AniAvatar_BCX_2017_Brawler.webp",
  },
  {
    label: "Patch Notes",
    href: "/patch-notes",
    avatar: "/assets/avatars/AniAvatar_Potion_Shelf.webp",
  },
  {
    label: "Meta Picks",
    href: "/meta-picks",
    avatar: "/assets/avatars/AniAvatar_Cursed_Kunai.webp",
  },
  {
    // The flipbook cat, because the page is a flipbook: two-second loops you
    // scrub through until the input order sticks.
    label: "The Lab",
    href: "/lab",
    avatar: "/assets/avatars/AniAvatar_Flipbook_Cat.webp",
  },
  {
    label: "Guilds",
    href: "/guilds",
    avatar: "/assets/avatars/AniAvatar_River_Raid.webp",
  },
]

function isActive(pathname: string, entry: NavEntry): boolean {
  if (pathname === entry.href) return true
  return (entry.match ?? [entry.href]).some((p) => pathname.startsWith(p))
}

/* --------------------------------------------------------------------------- */

function NavItem({
  entry,
  active,
  index,
  onNavigate,
}: {
  entry: NavEntry
  active: boolean
  index: number
  onNavigate?: () => void
}) {
  return (
    <Link
      href={entry.href}
      data-active={active}
      onClick={onNavigate}
      style={{ ["--rise-delay" as string]: `${120 + index * 45}ms` }}
      className={cn(
        "menu-btn animate-slide-in group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-base font-semibold tracking-wide uppercase",
        // Resting state — a frosted glass card floating over the video.
        "border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md",
        "hover:border-pink/50 hover:bg-card/55 hover:text-foreground",
        // Active state — pink-tinted glass with a pink glow (glow lives in CSS).
        "data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground"
      )}
    >
      <span className="relative shrink-0">
        <Image
          src={entry.avatar}
          alt=""
          width={40}
          height={40}
          unoptimized
          className={cn(
            "size-10 rounded-md object-contain transition-transform duration-200 select-none group-hover:scale-110",
            // Slight desaturation when resting; full color on hover/active.
            "opacity-80 grayscale-[0.35] group-hover:opacity-100 group-hover:grayscale-0",
            active && "opacity-100 grayscale-0"
          )}
        />
        {entry.live && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex size-2.5"
          >
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-negative opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full border border-card bg-negative" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.live && (
        // Static "live feed" tag — narrow md–lg rails hide it so the label
        // never truncates (the pulsing avatar dot still signals live there).
        <span className="ml-auto shrink-0 rounded-full bg-negative/15 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-negative uppercase md:max-xl:hidden">
          Live
        </span>
      )}
    </Link>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-3" aria-label="Primary">
      {NAV.map((entry, i) => (
        <NavItem
          key={entry.href}
          entry={entry}
          index={i}
          active={isActive(pathname, entry)}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="group font-wordmark flex items-center gap-2.5 text-3xl font-extrabold tracking-tight"
    >
      <Image
        src="/assets/Brawlchemist.png"
        alt=""
        width={40}
        height={40}
        priority
        className="size-9 shrink-0 transition-transform group-hover:rotate-12"
      />
      <span className="bg-gradient-to-r from-tier-s to-tier-valhallan bg-clip-text text-transparent">
        brawlchemist
      </span>
    </Link>
  )
}

function SocialFooter() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Tracking live data from the Brawlhalla Developer API.
        <br />
        Not affiliated with or endorsed by Blue Mammoth Games.
      </p>
      <div className="flex items-center gap-1">
        <a
          href="/github"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <GithubIcon className="size-4" />
        </a>
        <a
          href="/twitter"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X (Twitter)"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </a>
        <a
          href="/discord"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Discord"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <DiscordIcon className="size-4" />
        </a>
        <SoundToggle className="ml-auto" />
      </div>
    </div>
  )
}

/**
 * SidebarNav — the Brawlhalla-style vertical launcher menu. On md+ it's a
 * scroll-locked left rail (only the page column scrolls); below md it
 * collapses to a hamburger that opens a slide-in drawer.
 */
export function SidebarNav({
  user,
  claimed,
  flair,
  flairId,
}: {
  user: SessionUser | null
  claimed: ClaimedProfile | null
  flair?: FlairContext
  flairId?: string | null
}) {
  const [open, setOpen] = useState(false)

  // Lock body scroll while the mobile drawer is open, and close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      {/* Mobile top bar — replaces the removed global navbar below md. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-md border border-border/60 bg-card/60 text-foreground transition-colors hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        <Wordmark />
        <SoundToggle />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[82%] max-w-sm flex-col gap-6 border-r border-border/60 bg-card/95 p-5 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between">
            <Wordmark />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <AccountControl
            user={user}
            claimed={claimed}
            flair={flair}
            flairId={flairId}
          />
          <SocialFooter />
        </div>
      </div>

      {/* Tablet + desktop rail — transparent column (no panel/divider) so each
          nav item reads as its own glass card floating over the video. Sticks
          full-height and never scrolls itself; only the right column scrolls. */}
      <aside className="hidden h-full flex-col gap-7 overflow-hidden px-5 py-7 md:sticky md:top-0 md:flex md:h-svh xl:px-7">
        <Wordmark />
        {/* min-h-0 lets the nav yield so the account control + social footer
            (icons + music) stay pinned and visible.
            This used to be overflow-hidden, on the reasoning that the rail
            should never scroll and nothing was clipped anyway. The eighth entry
            ended that: at 1000px tall the list ran past the account control and
            Guilds simply was not on the page — no scrollbar, no hint, a
            destination that had quietly stopped existing. It scrolls now, with
            the same invisible-until-used bar /meta-picks uses, so the rail still
            reads as a static column on a tall screen and stays reachable on a
            short one. */}
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <AccountControl user={user} claimed={claimed} flair={flair} />
        <SocialFooter />
      </aside>
    </>
  )
}
