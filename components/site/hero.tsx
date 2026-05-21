import { Search } from "lucide-react"
import { LegendChip } from "./primitives"
import { TRENDING_LEGEND_IDS } from "@/lib/mock-data"

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambient ember glow — alchemy identity, kept low and wide. */}
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[520px] w-[820px] -translate-x-1/2 blur-3xl"
      />
      <div
        aria-hidden
        className="mystic-glow pointer-events-none absolute left-1/4 top-2/3 -z-10 h-[300px] w-[500px] -translate-x-1/2 blur-3xl"
      />

      <div className="mx-auto flex max-w-[760px] flex-col items-center px-4 pt-12 pb-6 text-center sm:px-6 sm:pt-16 sm:pb-8">
        <span className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          the brawlhalla stats laboratory
        </span>

        <h1 className="font-display text-4xl font-semibold tracking-[0.02em] sm:text-5xl md:text-6xl">
          BRAWL<span className="text-tier-s">CHEMIST</span>
        </h1>

        <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          Read the meta and track 1v1 & 2v2 ranked stats.
        </p>

        <form
          action="/search"
          className="group relative mt-5 w-full max-w-xl"
        >
          <div className="absolute inset-0 -z-10 rounded-xl bg-copper/10 blur-xl transition-opacity group-focus-within:opacity-100 opacity-60" />
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-4 py-3 shadow-[0_1px_0_0_oklch(1_0_0_/_0.04)_inset] backdrop-blur-md transition-colors focus-within:border-copper/60">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="Search a brawler — Name#1234 or Steam ID"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search players"
            />
            <kbd className="hidden rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              /
            </kbd>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider">trending</span>
          <span className="text-border">·</span>
          {TRENDING_LEGEND_IDS.map((id) => (
            <span
              key={id}
              className="rounded-full border border-border/60 bg-card/40 px-2 py-1 transition-colors hover:border-copper/40 hover:text-foreground"
            >
              <LegendChip legendId={id} size="sm" />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
