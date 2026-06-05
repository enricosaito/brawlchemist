import { LauncherHero } from "@/components/site/launcher/launcher-hero"
import { SidebarNav } from "@/components/site/launcher/sidebar-nav"
import { VideoBackground } from "@/components/site/launcher/video-background"
import { SiteFooter } from "@/components/site/site-footer"
import { TopLegendsCard } from "@/components/site/top-legends-card"
import {
  HOME_REGIONS,
  type HomeRegion,
  TopPlayersCard,
} from "@/components/site/top-players-card"
import { WeaponMetaCard } from "@/components/site/weapon-meta-card"
import type { ApiGameMode } from "@/lib/brawlhalla-api"
import { CURRENT_PATCH } from "@/lib/mock-data"

function isHomeRegion(v: string | undefined): v is HomeRegion {
  return !!v && (HOME_REGIONS as readonly string[]).includes(v)
}

// Frosted-glass surface for the data cards: heavy blur softens the moving
// starfield behind, the dark tint keeps tables/text legible.
const GLASS = "bg-card/55 backdrop-blur-2xl border-white/10"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const params = await searchParams
  const queue: ApiGameMode = params.queue === "2v2" ? "2v2" : "1v1"
  const region: HomeRegion = isHomeRegion(params.region) ? params.region : "ALL"

  return (
    <>
      {/* Animated starfield behind everything, darkened for contrast. */}
      <VideoBackground />

      {/*
        Homepage launcher. Left third = the (bigger) game-menu rail; right two
        thirds = hero + search on top, 3-col data cards below — the old
        homepage shape, now floating as frosted glass over the video.

        md+: 2-col grid (rail sticks full-height while the right column scrolls).
        Below md: everything stacks; the rail becomes a hamburger drawer.
      */}
      <div className="relative min-h-svh md:grid md:grid-cols-[clamp(280px,30%,420px)_minmax(0,1fr)]">
        <SidebarNav />

        <main className="flex flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <LauncherHero featuredPatch={CURRENT_PATCH} />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <TopPlayersCard queue={queue} region={region} className={GLASS} />
            <TopLegendsCard className={GLASS} />
            <WeaponMetaCard className={GLASS} />
          </section>
        </main>
      </div>

      <div className="relative backdrop-blur-md">
        <SiteFooter />
      </div>
    </>
  )
}
