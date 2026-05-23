import Image from "next/image"
import Link from "next/link"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Legends", href: "/legends" },
  { label: "Weapons", href: "/weapons" },
]

interface LeaderboardOption {
  label: string
  href: string
  avatar: string
}

const LEADERBOARD_OPTIONS: LeaderboardOption[] = [
  {
    label: "1v1 Rankings",
    href: "/leaderboards?queue=1v1",
    avatar: "/assets/AniAvatar_Volkonomicon.webp",
  },
  {
    label: "2v2 Teams",
    href: "/leaderboards?queue=2v2",
    avatar: "/assets/AniAvatar_Forest_Sprites.webp",
  },
  {
    label: "Solo 2v2",
    href: "/leaderboards?queue=2v2",
    // Filename has a literal & — URL-encode so it doesn't get parsed as
    // a query-string separator when Next/Image rewrites it.
    avatar: "/assets/AniAvatar_Ash_%26_Yarra.webp",
  },
  {
    label: "OTPs",
    href: "/leaderboards",
    avatar: "/assets/AniAvatar_Kazuya_Mishima.webp",
  },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-wordmark text-xl font-extrabold tracking-tight"
        >
          <Image
            src="/assets/Brawlchemist.png"
            alt=""
            width={32}
            height={32}
            priority
            className="size-7 shrink-0 transition-transform group-hover:rotate-12"
          />
          <span className="bg-gradient-to-r from-tier-s to-tier-valhallan bg-clip-text text-transparent">
            brawlchemist
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {/* Leaderboards: hover-triggered dropdown. CSS-only via
              group-hover + focus-within (keyboard accessible). */}
          <div className="group/lb relative">
            <Link
              href="/leaderboards"
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-foreground transition-colors",
                "hover:bg-muted",
              )}
            >
              Leaderboards
              <ChevronDown
                className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover/lb:-rotate-180 group-focus-within/lb:-rotate-180"
                aria-hidden
              />
            </Link>
            <div
              className={cn(
                "invisible absolute left-0 top-full z-50 mt-1 w-60 translate-y-1 rounded-xl border border-border/60 bg-card/95 p-1.5 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200",
                "group-hover/lb:visible group-hover/lb:translate-y-0 group-hover/lb:opacity-100",
                "group-focus-within/lb:visible group-focus-within/lb:translate-y-0 group-focus-within/lb:opacity-100",
              )}
              role="menu"
            >
              {LEADERBOARD_OPTIONS.map((opt) => (
                <Link
                  key={opt.label}
                  href={opt.href}
                  role="menuitem"
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Image
                    src={opt.avatar}
                    alt=""
                    width={28}
                    height={28}
                    unoptimized
                    className="size-7 shrink-0 select-none rounded-md object-contain"
                  />
                  <span>{opt.label}</span>
                </Link>
              ))}
            </div>
          </div>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-foreground transition-colors",
                "hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Search"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="size-4" />
          </button>
          {/* "press d for theme" hint removed; the keybind handler stays
              wired so the shortcut still works for power users. */}
        </div>
      </div>
    </header>
  )
}
