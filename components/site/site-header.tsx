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

// Lucide doesn't ship a Discord brand icon; inline the official mark.
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.78 14.78 0 0 0-.706 1.435 18.27 18.27 0 0 0-5.706 0A14.78 14.78 0 0 0 9.44 3a19.79 19.79 0 0 0-3.76 1.369C2.236 9.4 1.317 14.31 1.77 19.151c1.616 1.197 3.183 1.926 4.724 2.406a14.74 14.74 0 0 0 1.013-1.65 13.07 13.07 0 0 1-1.595-.768c.134-.098.265-.2.392-.305 3.075 1.42 6.41 1.42 9.443 0 .128.105.259.207.392.305a13.07 13.07 0 0 1-1.597.769 14.74 14.74 0 0 0 1.013 1.65c1.541-.481 3.11-1.21 4.726-2.407.546-5.6-.929-10.467-3.962-14.782ZM8.02 16.27c-.93 0-1.694-.86-1.694-1.92 0-1.06.752-1.92 1.694-1.92.943 0 1.706.872 1.694 1.92 0 1.06-.751 1.92-1.694 1.92Zm7.96 0c-.93 0-1.694-.86-1.694-1.92 0-1.06.752-1.92 1.694-1.92.943 0 1.706.872 1.694 1.92 0 1.06-.751 1.92-1.694 1.92Z" />
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
    href: "/leaderboards/2v2",
    avatar: "/assets/AniAvatar_River_Raid.webp",
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

const TIERLIST_OPTIONS: DropdownOption[] = [
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
    label: "Stances",
    href: "/stances",
    avatar: "/assets/AniAvatar_Potion_Shelf.webp",
    comingSoon: true,
  },
  {
    label: "2v2 Comps",
    // Ampersand in the filename must be URL-encoded so Next/Image can fetch it.
    href: "/comps",
    avatar: "/assets/AniAvatar_Ash_%26_Yarra.webp",
    comingSoon: true,
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
          <NavDropdown label="Tierlist" href="/legends" options={TIERLIST_OPTIONS} />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a
            href="https://github.com/enricosaito/brawlchemist"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <GithubIcon className="size-4" />
          </a>
          <a
            href="https://discord.gg/jXpe8kjYwQ"
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
