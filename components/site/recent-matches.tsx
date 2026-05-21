import { Clock } from "lucide-react"
import { RECENT_MATCHES, WEAPON_NAMES } from "@/lib/mock-data"
import {
  formatDuration,
  formatRelativeTime,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import { Delta, LegendChip, RegionPill } from "./primitives"
import type { Match, MatchParticipant } from "@/lib/types"

function Side({
  participants,
  isWinner,
}: {
  participants: MatchParticipant[]
  isWinner: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border px-2.5 py-2",
        isWinner
          ? "border-positive/30 bg-positive/5"
          : "border-negative/20 bg-negative/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-wider",
            isWinner ? "text-positive" : "text-negative",
          )}
        >
          {isWinner ? "Victory" : "Defeat"}
        </span>
        <Delta value={participants[0]?.eloChange ?? 0} />
      </div>
      <ul className="flex flex-col gap-1">
        {participants.map((p) => (
          <li key={p.playerId} className="flex items-center gap-2">
            <LegendChip legendId={p.legendId} size="sm" showName={false} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs">{p.playerName}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {WEAPON_NAMES[p.topWeaponId]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MatchCard({ match }: { match: Match }) {
  const winners = match.participants.filter((p) =>
    match.winnerIds.includes(p.playerId),
  )
  const losers = match.participants.filter(
    (p) => !match.winnerIds.includes(p.playerId),
  )

  return (
    <article className="flex w-[340px] shrink-0 flex-col gap-2.5 rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-border">
      <header className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-copper">
            {match.queue}
          </span>
          <RegionPill region={match.region} />
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(match.durationSec)}
          </span>
          <span>·</span>
          <span>{formatRelativeTime(match.endedAt)}</span>
        </div>
      </header>
      <div className="flex items-stretch gap-2">
        <Side participants={winners} isWinner />
        <Side participants={losers} isWinner={false} />
      </div>
    </article>
  )
}

export function RecentMatches() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
            Recent notable matches
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            High-ELO games from the last hour, across regions.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-positive" />
          live
        </span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <div className="flex gap-3 pb-2">
          {RECENT_MATCHES.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    </section>
  )
}
