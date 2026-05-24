import { PlayerSearchForm } from "@/components/site/player-search-form"

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

        <h1 className="bg-gradient-to-r from-tier-s to-tier-valhallan bg-clip-text font-wordmark text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl md:text-7xl">
          brawlchemist
        </h1>

        <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          Transform high-ranked players&apos; gameplay stats into actionable insight.
        </p>

        <PlayerSearchForm className="mt-5" showHint />
      </div>
    </section>
  )
}
