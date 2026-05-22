import Image from "next/image"
import Link from "next/link"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Leaderboards", href: "/leaderboards" },
  { label: "Legends", href: "/legends" },
  { label: "Weapons", href: "/weapons" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-display text-base font-semibold tracking-wider"
        >
          <Image
            src="/assets/Brawlchemist.png"
            alt=""
            width={32}
            height={32}
            priority
            className="size-7 shrink-0 transition-transform group-hover:rotate-12"
          />
          <span>
            BRAWL<span className="text-tier-s">CHEMIST</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
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
