import { Suspense } from "react"

import { LauncherHero } from "@/components/site/launcher/launcher-hero"
import { PreviewCardSkeleton } from "@/components/site/skeletons"
import { TopLegendsCard } from "@/components/site/top-legends-card"
import {
  HOME_REGIONS,
  type HomeRegion,
  TopPlayersCard,
} from "@/components/site/top-players-card"
import { WeaponMetaCard } from "@/components/site/weapon-meta-card"
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
  searchParams: Promise<{ region?: string }>
}) {
  const params = await searchParams
  const region: HomeRegion = isHomeRegion(params.region) ? params.region : "ALL"

  // The launcher chrome (nav rail, video, music) lives in AppShell; this page
  // is just the home content rendered in the right two-thirds.
  return (
    // Tight vertical rhythm so hero + cards fit a 1080p viewport unscrolled;
    // the auto margins center the pair vertically when there's room to spare.
    <main className="flex min-h-svh flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <LauncherHero featuredPatch={CURRENT_PATCH} className="mt-auto" />

      {/* Each card owns its own Suspense boundary so the launcher shell — hero,
          search, card chrome — paints on the first frame and the three data
          cards stream in independently, rather than the whole screen waiting on
          the slowest query. */}
      <section className="mb-auto grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<PreviewCardSkeleton className={GLASS} />}>
          <TopPlayersCard region={region} className={GLASS} />
        </Suspense>
        <Suspense fallback={<PreviewCardSkeleton className={GLASS} />}>
          <TopLegendsCard className={GLASS} />
        </Suspense>
        <Suspense fallback={<PreviewCardSkeleton className={GLASS} />}>
          <WeaponMetaCard className={GLASS} />
        </Suspense>
      </section>
    </main>
  )
}
