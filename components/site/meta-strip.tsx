import Image from "next/image"
import { Activity, Trophy } from "lucide-react"
import type { ApiRegion } from "@/lib/brawlhalla-api"
import { META_SNAPSHOT } from "@/lib/mock-data"
import { formatCompact } from "@/lib/format"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import { RankIcon } from "./primitives"

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

function CardShell({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
          {title}
        </h2>
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
        </div>
      </header>
      <div className="flex-1 px-4 py-3">{children}</div>
    </section>
  )
}

export async function MetaStrip() {
  const cutoffs = await getValhallanCutoffs("1v1", CUTOFF_REGIONS)

  return (
    <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CardShell
          title="Valhallan Cutoff"
          icon={<RankIcon tier="Valhallan" size={20} />}
        >
          <ul className="divide-y divide-border/60">
            {CUTOFF_REGIONS.map((region) => {
              const c = cutoffs.get(region)
              const flag = REGION_FLAG[region]
              return (
                <li
                  key={region}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="flex items-center gap-2">
                    {flag && (
                      <Image
                        src={flag}
                        alt=""
                        width={20}
                        height={20}
                        className="shrink-0 select-none rounded-sm object-cover"
                      />
                    )}
                    <span className="text-sm font-medium">
                      {REGION_LABEL[region] ?? region}
                    </span>
                  </span>
                  <span className="font-mono text-base font-medium tabular-nums text-tier-valhallan">
                    {c ? c.rating.toLocaleString() : "—"}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardShell>

        <CardShell
          title="Players Online"
          icon={<Activity className="size-4" />}
        >
          <div className="flex h-full flex-col justify-center gap-1">
            <span className="font-mono text-3xl font-medium tabular-nums">
              {formatCompact(META_SNAPSHOT.playersOnline)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              live across all regions
            </span>
          </div>
        </CardShell>

        <CardShell
          title="Next Championship"
          icon={<Trophy className="size-4" />}
        >
          <div className="flex h-full flex-col justify-center gap-1">
            <span className="text-base font-medium">
              {META_SNAPSHOT.nextMajorTournament.name}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {META_SNAPSHOT.nextMajorTournament.when}
            </span>
          </div>
        </CardShell>
      </div>
    </section>
  )
}
