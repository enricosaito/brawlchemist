import Image from "next/image"
import { Trophy } from "lucide-react"
import type { ApiRegion } from "@/lib/brawlhalla-api"
import { META_SNAPSHOT } from "@/lib/mock-data"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"

const CUTOFF_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]

const REGION_LABEL: Partial<Record<ApiRegion, string>> = {
  "US-E": "USA",
  EU: "Europe",
  BRZ: "Brazil",
}

const REGION_FLAG: Partial<Record<ApiRegion, string>> = {
  "US-E": "/assets/usa.webp",
  EU: "/assets/europe.webp",
  BRZ: "/assets/brazil.webp",
}

export async function MetaStrip() {
  const cutoffs = await getValhallanCutoffs("1v1", CUTOFF_REGIONS)

  return (
    <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-4">
        {CUTOFF_REGIONS.map((region) => {
          const c = cutoffs.get(region)
          const flag = REGION_FLAG[region]
          const label = REGION_LABEL[region] ?? region
          return (
            <div
              key={region}
              className="flex items-center justify-between gap-3 bg-card/80 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {label} Valhallan Cutoff
                </span>
                <span className="mt-0.5 truncate font-mono text-base font-medium tabular-nums text-tier-valhallan">
                  {c ? c.rating.toLocaleString() : "—"}
                </span>
              </div>
              {flag && (
                <Image
                  src={flag}
                  alt=""
                  width={28}
                  height={28}
                  className="shrink-0 select-none rounded-sm object-cover"
                />
              )}
            </div>
          )
        })}
        <div className="flex items-center justify-between gap-3 bg-card/80 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Next Championship
            </span>
            <span className="mt-0.5 truncate text-base font-medium">
              {META_SNAPSHOT.nextMajorTournament.name}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Trophy className="size-4 text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {META_SNAPSHOT.nextMajorTournament.when}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
