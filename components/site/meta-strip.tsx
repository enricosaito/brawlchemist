import { Trophy } from "lucide-react"
import type { ApiRegion } from "@/lib/brawlhalla-api"
import { META_SNAPSHOT } from "@/lib/mock-data"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { RankIcon } from "./primitives"

const CUTOFF_REGIONS: ApiRegion[] = ["US-E", "EU", "BRZ"]

const REGION_LABEL: Record<ApiRegion, string> = {
  ALL: "All",
  "US-E": "NA East",
  "US-W": "NA West",
  EU: "Europe",
  SEA: "SEA",
  AUS: "Oceania",
  BRZ: "Brazil",
  JPS: "Japan",
  SA: "South America",
  ME: "Middle East",
}

export async function MetaStrip() {
  const cutoffs = await getValhallanCutoffs("1v1", CUTOFF_REGIONS)

  const cutoffTiles = CUTOFF_REGIONS.map((region) => {
    const c = cutoffs.get(region)
    return {
      region,
      label: `${REGION_LABEL[region]} Valhallan`,
      value: c ? c.rating.toLocaleString() : "—",
      hint: c ? `#${c.rank} ${c.username}` : "no data",
    }
  })

  return (
    <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-4">
        {cutoffTiles.map((tile) => (
          <div
            key={tile.region}
            className="flex items-center justify-between gap-3 bg-card/80 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tile.label} cutoff
              </span>
              <span className="mt-0.5 truncate font-mono text-base font-medium tabular-nums text-tier-valhallan">
                {tile.value}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <RankIcon tier="Valhallan" size={20} />
              <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tile.hint}
              </span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 bg-card/80 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Next major tournament
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
