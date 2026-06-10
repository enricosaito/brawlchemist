"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import type { SessionUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { AccountControl } from "./account-control"
import { SoundToggle } from "./sound-toggle"

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
    avatar: "/assets/AniAvatar_Retro_Mjolnir.webp",
  },
  {
    label: "Leaderboards",
    href: "/leaderboards/1v1",
    avatar: "/assets/AniAvatar_Volkonomicon.webp",
    match: ["/leaderboards"],
  },
  {
    label: "Ranked Queue",
    href: "/live",
    avatar: "/assets/AniAvatar_Ash_%26_Yarra.webp",
    live: true,
  },
  {
    label: "Tournaments",
    href: "/tournaments",
    avatar: "/assets/AniAvatar_BCX_2017_Brawler.webp",
  },
  {
    label: "Patch Notes",
    href: "/patch-notes",
    avatar: "/assets/AniAvatar_Tome_of_Rituals.webp",
  },
  {
    label: "Weapons",
    href: "/weapons",
    avatar: "/assets/AniAvatar_Cursed_Kunai.webp",
  },
  {
    label: "Legends",
    href: "/legends",
    avatar: "/assets/AniAvatar_Metamorphosis.webp",
  },
  {
    label: "Guilds",
    href: "/guilds",
    avatar: "/assets/AniAvatar_River_Raid.webp",
  },
]

/**
 * The profile entry is account-aware: it points a logged-in owner at their own
 * claimed player page ("My Profile"), and everyone else at the claim/verify
 * flow ("Link Profile"). Its avatar reuses the slot freed by the old OTPs link.
 */
function profileEntry(claimedId: number | null): NavEntry {
  if (claimedId != null) {
    return {
      label: "My Profile",
      href: `/player/${claimedId}`,
      avatar: "/assets/AniAvatar_Kazuya_Mishima.webp",
      match: [`/player/${claimedId}`],
    }
  }
  return {
    label: "Link Profile",
    href: "/claim",
    avatar: "/assets/AniAvatar_Kazuya_Mishima.webp",
    match: ["/claim"],
  }
}

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
        "menu-btn animate-slide-in group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-base font-semibold uppercase tracking-wide",
        // Resting state — a frosted glass card floating over the video.
        "border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md",
        "hover:border-pink/50 hover:bg-card/55 hover:text-foreground",
        // Active state — pink-tinted glass with a pink glow (glow lives in CSS).
        "data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground",
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
            "size-10 select-none rounded-md object-contain transition-transform duration-200 group-hover:scale-110",
            // Slight desaturation when resting; full color on hover/active.
            "opacity-80 grayscale-[0.35] group-hover:opacity-100 group-hover:grayscale-0",
            active && "opacity-100 grayscale-0",
          )}
        />
        {entry.live && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex size-2.5"
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
        <span className="ml-auto shrink-0 rounded-full bg-negative/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-negative md:max-xl:hidden">
          Live
        </span>
      )}
    </Link>
  )
}

function NavList({
  claimedId,
  onNavigate,
}: {
  claimedId: number | null
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  // Profile entry rides at the end of the rail, after the content destinations.
  const entries = [...NAV, profileEntry(claimedId)]
  return (
    <nav className="flex flex-col gap-3" aria-label="Primary">
      {entries.map((entry, i) => (
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
      className="group flex items-center gap-2.5 font-wordmark text-3xl font-extrabold tracking-tight"
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
  claimedId,
}: {
  user: SessionUser | null
  claimedId: number | null
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
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[82%] max-w-sm flex-col gap-6 border-r border-border/60 bg-card/95 p-5 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full",
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
            <NavList
              claimedId={claimedId}
              onNavigate={() => setOpen(false)}
            />
          </div>
          <AccountControl user={user} />
          <SocialFooter />
        </div>
      </div>

      {/* Tablet + desktop rail — transparent column (no panel/divider) so each
          nav item reads as its own glass card floating over the video. Sticks
          full-height and never scrolls itself; only the right column scrolls. */}
      <aside className="hidden h-full flex-col gap-7 overflow-hidden px-5 py-7 md:sticky md:top-0 md:flex md:h-svh xl:px-7">
        <Wordmark />
        {/* The nav list scrolls within itself (min-h-0) so the account control
            and social footer below stay pinned and visible even when the rail
            is taller than a short viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList claimedId={claimedId} />
        </div>
        <AccountControl user={user} />
        <SocialFooter />
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------------------
   Brand marks — Lucide dropped brand icons under its no-brand policy, so the
   canonical SVGs are inlined (mirrors the old SiteHeader).
   ------------------------------------------------------------------------- */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.467-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
