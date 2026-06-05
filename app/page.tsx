import { LauncherHero } from "@/components/site/launcher/launcher-hero"
import {
  RightPanel,
  WhatsNewCard,
} from "@/components/site/launcher/right-panel"
import { SidebarNav } from "@/components/site/launcher/sidebar-nav"
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
      {/*
        Homepage launcher — Brawlhalla-style 3-column screen. The global top
        navbar (SiteHeader) is intentionally absent here; the left rail is the
        navigation. Inner pages still render SiteHeader so data gets full width.

        Desktop (lg+): fixed-height single screen — left rail + right rail
        scroll internally, center hero stays put.
        Tablet (md–lg): 2-col grid via named areas — visible rail spanning both
        rows, hero on top, data cards stacked beneath; the page scrolls.
        Below md: everything stacks and scrolls; the rail becomes a drawer.
      */}
      <div className="relative isolate min-h-svh md:grid md:grid-cols-[240px_minmax(0,1fr)] md:[grid-template-areas:'nav_main'_'nav_side'] lg:h-svh lg:grid-cols-[clamp(260px,28%,360px)_minmax(0,1fr)_clamp(300px,26%,400px)] lg:overflow-hidden lg:[grid-template-areas:'nav_main_side']">
        {/* Page-wide ambient backdrop. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,oklch(0.2_0.03_285/0.5),transparent_60%)]"
        />

        <SidebarNav />

        <LauncherHero
          featuredPatch={CURRENT_PATCH}
          className="md:[grid-area:main]"
        />

        <RightPanel className="md:[grid-area:side]">
          <WhatsNewCard patch={CURRENT_PATCH} />
          <TopPlayersCard queue={queue} region={region} />
          <TopLegendsCard />
          <WeaponMetaCard />
        </RightPanel>
      </div>

      {/* Footer only below lg — the desktop launcher is a fixed single screen. */}
      <div className="lg:hidden">
        <SiteFooter />
      </div>
    </>
  )
}
