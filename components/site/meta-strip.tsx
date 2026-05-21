import { Activity, Crown, Swords, Trophy } from "lucide-react"
import { META_SNAPSHOT, WEAPONS, WEAPON_NAMES, getLegend } from "@/lib/mock-data"
import { formatCompact, formatPercent } from "@/lib/format"

export function MetaStrip() {
  const topLegend = getLegend(META_SNAPSHOT.topLegendId)
  const topWeapon = WEAPON_NAMES[META_SNAPSHOT.topWeaponId]
  const topWeaponPickRate = WEAPONS.find(
    (w) => w.id === META_SNAPSHOT.topWeaponId,
  )?.pickRate

  const tiles = [
    {
      icon: Activity,
      label: "Players online",
      value: formatCompact(META_SNAPSHOT.playersOnline),
      hint: "live",
    },
    {
      icon: Crown,
      label: "Top legend",
      value: topLegend?.name ?? "—",
      hint: `${formatPercent(topLegend?.winRate ?? 0)} WR`,
    },
    {
      icon: Swords,
      label: "Top weapon",
      value: topWeapon,
      hint:
        topWeaponPickRate !== undefined
          ? `${formatPercent(topWeaponPickRate)} pick`
          : "",
    },
    {
      icon: Trophy,
      label: "Next major tournament",
      value: META_SNAPSHOT.nextMajorTournament.name,
      hint: META_SNAPSHOT.nextMajorTournament.when,
    },
  ]

  return (
    <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 bg-card/80 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <span className="mt-0.5 truncate text-base font-medium">
                {value}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Icon className="size-4 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {hint}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
