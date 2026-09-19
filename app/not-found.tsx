import Link from "next/link"
import Image from "next/image"
import { Home, Search, Swords } from "lucide-react"

export const metadata = {
  title: "Brawlchemist | Not found",
  description: "That page doesn't exist.",
}

/**
 * 404.
 *
 * There was no not-found at all, so a mistyped URL got Next's stock black page
 * — which on a site that is otherwise entirely one visual language reads as a
 * different website having an outage.
 *
 * It offers the three places a lost visitor actually wants, and nothing else. A
 * 404 is not a destination, so the fastest thing it can do is stop being one.
 */
const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/leaderboards/1v1", label: "Leaderboards", icon: Swords },
  { href: "/search", label: "Search players", icon: Search },
]

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <Image
        src="/assets/legends/unknown.png"
        alt=""
        aria-hidden
        width={96}
        height={96}
        unoptimized
        className="mb-6 size-20 rounded-xl border border-border/60 opacity-70 select-none"
      />
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        404
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
        This page isn&apos;t on the map
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The link may be old, or the page may never have existed. Nothing is
        broken — you are just somewhere that isn&apos;t.
      </p>

      <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-4 py-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase backdrop-blur-sm transition-colors hover:border-pink/50 hover:text-foreground"
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
