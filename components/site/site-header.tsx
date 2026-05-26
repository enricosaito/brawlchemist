import Image from "next/image"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Lucide dropped brand icons (GitHub, Discord) under their no-brand policy
// in 1.x. Inline the canonical marks instead.
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.467-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

// Lucide doesn't ship a Discord brand icon; inline the official mark
// (simple-icons, viewBox 0 0 24 24 so it sits square alongside the others).
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

// X (formerly Twitter) — Lucide dropped brand icons; inline the official mark.
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

interface DropdownOption {
  label: string
  href: string
  avatar: string
  comingSoon?: boolean
}

const LEADERBOARD_OPTIONS: DropdownOption[] = [
  {
    label: "1v1 Rankings",
    href: "/leaderboards/1v1",
    avatar: "/assets/AniAvatar_Volkonomicon.webp",
  },
  {
    label: "2v2 Teams",
    href: "/leaderboards/2v2",
    avatar: "/assets/AniAvatar_Forest_Sprites.webp",
  },
  {
    label: "Solo 2v2",
    href: "/leaderboards/solo_2v2",
    // Ampersand in the filename must be URL-encoded so Next/Image can fetch it.
    avatar: "/assets/AniAvatar_Ash_%26_Yarra.webp",
  },
  {
    label: "OTPs",
    href: "/otps",
    avatar: "/assets/AniAvatar_Kazuya_Mishima.webp",
  },
  // Pro Players — hidden for now (WIP). The page still lives at
  // /leaderboards/pro; restore this entry when it's ready.
  // {
  //   label: "Pro Players",
  //   href: "/leaderboards/pro",
  //   avatar: "/assets/AniAvatar_Crown_of_the_Exalted.webp",
  // },
]

const EXPLORE_OPTIONS: DropdownOption[] = [
  {
    label: "Legends",
    href: "/legends",
    avatar: "/assets/AniAvatar_Metamorphosis.webp",
  },
  {
    label: "Weapons",
    href: "/weapons",
    avatar: "/assets/AniAvatar_Cursed_Kunai.webp",
  },
  {
    label: "Guilds",
    href: "/guilds",
    avatar: "/assets/AniAvatar_River_Raid.webp",
  },
  {
    label: "Tournaments",
    href: "/tournaments",
    avatar: "/assets/AniAvatar_Crown_of_the_Exalted.webp",
  },
  {
    label: "Patch Notes",
    href: "/patch-notes",
    avatar: "/assets/AniAvatar_Potion_Shelf.webp",
  },
]

function NavDropdown({
  label,
  href,
  options,
}: {
  label: string
  href: string
  options: DropdownOption[]
}) {
  return (
    <div className="group/dd relative">
      <Link
        href={href}
        className={cn(
          "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-foreground transition-colors",
          "hover:bg-muted",
        )}
      >
        {label}
        <ChevronDown
          className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover/dd:-rotate-180 group-focus-within/dd:-rotate-180"
          aria-hidden
        />
      </Link>
      <div
        className={cn(
          "invisible absolute left-0 top-full z-50 mt-1 w-80 translate-y-1 rounded-xl border border-border/60 bg-card/95 p-2 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200",
          "group-hover/dd:visible group-hover/dd:translate-y-0 group-hover/dd:opacity-100",
          "group-focus-within/dd:visible group-focus-within/dd:translate-y-0 group-focus-within/dd:opacity-100",
        )}
        role="menu"
      >
        {options.map((opt) =>
          opt.comingSoon ? (
            <div
              key={opt.label}
              role="menuitem"
              aria-disabled
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground opacity-60"
            >
              <Image
                src={opt.avatar}
                alt=""
                width={44}
                height={44}
                unoptimized
                className="size-11 shrink-0 select-none rounded-md object-contain grayscale"
              />
              <span className="flex-1">{opt.label}</span>
              <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Soon
              </span>
            </div>
          ) : (
            <Link
              key={opt.label}
              href={opt.href}
              role="menuitem"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Image
                src={opt.avatar}
                alt=""
                width={44}
                height={44}
                unoptimized
                className="size-11 shrink-0 select-none rounded-md object-contain"
              />
              <span>{opt.label}</span>
            </Link>
          ),
        )}
      </div>
    </div>
  )
}

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
          <NavDropdown
            label="Leaderboards"
            href="/leaderboards/1v1"
            options={LEADERBOARD_OPTIONS}
          />
          <NavDropdown label="Explore" href="/legends" options={EXPLORE_OPTIONS} />
        </nav>
        <div className="ml-auto flex items-center gap-1">
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
          {/* "press d for theme" hint removed; the keybind handler stays
              wired so the shortcut still works for power users. */}
        </div>
      </div>
    </header>
  )
}
