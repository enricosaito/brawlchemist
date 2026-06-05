import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerSearchForm } from "@/components/site/player-search-form"

/**
 * LauncherHero — the top of the right column: brand wordmark, tagline, and the
 * player-search CTA, with a featured patch banner. Ambiance now comes from the
 * video background, so this is a clean text block (no art/glows/parallax) that
 * reads over the darkened starfield.
 */
export function LauncherHero({
  featuredPatch,
  className,
}: {
  featuredPatch?: string
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col items-center px-2 text-center",
        className,
      )}
    >
      <span
        className="animate-rise font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground"
        style={{ ["--rise-delay" as string]: "80ms" }}
      >
        the brawlhalla stats laboratory
      </span>

      <h1
        className="animate-rise mt-3 max-w-full bg-gradient-to-r from-tier-s to-tier-valhallan bg-clip-text font-wordmark text-[clamp(2.5rem,8vw,5.5rem)] font-extrabold leading-[0.95] tracking-tight text-transparent drop-shadow-[0_2px_24px_oklch(0.13_0.012_250/0.8)]"
        style={{ ["--rise-delay" as string]: "150ms" }}
      >
        brawlchemist
      </h1>

      <p
        className="animate-rise mt-4 max-w-md text-sm text-foreground/80 sm:text-base"
        style={{ ["--rise-delay" as string]: "230ms" }}
      >
        Transform high-ranked players&apos; gameplay stats into actionable
        insight. Search a player to begin.
      </p>

      <div
        className="animate-rise mt-7 flex w-full justify-center"
        style={{ ["--rise-delay" as string]: "320ms" }}
      >
        <PlayerSearchForm showHint autoFocus />
      </div>

      {/* Featured banner — links to the latest patch read. */}
      <Link
        href="/patch-notes"
        className="animate-rise group mt-7 inline-flex items-center gap-3 rounded-full border border-copper/40 bg-card/40 px-5 py-2 backdrop-blur-md transition-colors hover:border-copper/70 hover:bg-card/70"
        style={{ ["--rise-delay" as string]: "420ms" }}
      >
        <span className="rounded-full bg-copper/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
          {featuredPatch ? `Patch ${featuredPatch}` : "Latest"}
        </span>
        <span className="text-sm font-medium text-foreground/90">
          What changed this patch
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-copper" />
      </Link>
    </section>
  )
}
