import { LauncherHero } from "@/components/site/launcher/launcher-hero"
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

  // The launcher chrome (nav rail, video, music) lives in AppShell; this page
  // is just the home content rendered in the right two-thirds.
  return (
    <main className="flex flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <LauncherHero featuredPatch={CURRENT_PATCH} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TopPlayersCard queue={queue} region={region} className={GLASS} />
        <TopLegendsCard className={GLASS} />
        <WeaponMetaCard className={GLASS} />
      </section>
    </main>
  )
}
