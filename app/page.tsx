import { Hero } from "@/components/site/hero"
import { MetaStrip } from "@/components/site/meta-strip"
// Recent Notable Matches is hidden for now — it's WIP on mock data. Restore the
// import + the <RecentMatches /> block below once it's backed by real matches.
// import { RecentMatches } from "@/components/site/recent-matches"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { TopLegendsCard } from "@/components/site/top-legends-card"
import {
  HOME_REGIONS,
  type HomeRegion,
  TopPlayersCard,
} from "@/components/site/top-players-card"
import { WeaponMetaCard } from "@/components/site/weapon-meta-card"
import type { ApiGameMode } from "@/lib/brawlhalla-api"

function isHomeRegion(v: string | undefined): v is HomeRegion {
  return !!v && (HOME_REGIONS as readonly string[]).includes(v)
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const params = await searchParams
  const queue: ApiGameMode = params.queue === "2v2" ? "2v2" : "1v1"
  const region: HomeRegion = isHomeRegion(params.region) ? params.region : "BRZ"

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main>
        <Hero />

        <div className="rune-divider mx-auto max-w-[1280px]" />

        <div className="mt-5">
          <MetaStrip />
        </div>

        <section className="mx-auto mb-12 mt-5 max-w-[1280px] px-4 sm:mb-16 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TopPlayersCard queue={queue} region={region} />
            <TopLegendsCard />
            <WeaponMetaCard />
          </div>
        </section>

        {/* Hidden until backed by real data — WIP on mock data. The divider
            above only separated the cards from this section, so it's gone too.
        <div className="my-8 px-4 sm:px-6">
          <div className="rune-divider mx-auto max-w-[1280px]" />
        </div>
        <RecentMatches /> */}
      </main>
      <SiteFooter />
    </div>
  )
}
