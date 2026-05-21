import { Hero } from "@/components/site/hero"
import { MetaStrip } from "@/components/site/meta-strip"
import { RecentMatches } from "@/components/site/recent-matches"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { TopLegendsCard } from "@/components/site/top-legends-card"
import { TopPlayersCard } from "@/components/site/top-players-card"
import { WeaponMetaCard } from "@/components/site/weapon-meta-card"

export default function Page() {
  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main>
        <Hero />

        <div className="rune-divider mx-auto max-w-[1280px]" />

        <div className="mt-8">
          <MetaStrip />
        </div>

        <section className="mx-auto mt-8 max-w-[1280px] px-4 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TopPlayersCard />
            <TopLegendsCard />
            <WeaponMetaCard />
          </div>
        </section>

        <div className="my-12 px-4 sm:px-6">
          <div className="rune-divider mx-auto max-w-[1280px]" />
        </div>

        <RecentMatches />
      </main>
      <SiteFooter />
    </div>
  )
}
