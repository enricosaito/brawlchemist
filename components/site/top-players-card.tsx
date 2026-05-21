"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { TOP_PLAYERS_1V1, TOP_PLAYERS_2V2 } from "@/lib/mock-data"
import { formatElo, formatPercent } from "@/lib/format"
import { PreviewCard } from "./preview-card"
import {
  Delta,
  LegendChip,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "./primitives"
import type { Player, Queue } from "@/lib/types"

const QUEUES: { id: Queue; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
]

function PlayerRow({ player, index }: { player: Player; index: number }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
      <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <RankIcon tier={player.rank.tier} size={28} />
      <LegendChip
        legendId={player.avatarLegendId}
        size="md"
        showName={false}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{player.name}</span>
          <RegionPill region={player.region} />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "font-medium uppercase tracking-wider text-[10px]",
              TIER_TEXT_COLOR[player.rank.tier],
            )}
          >
            {player.rank.tier}
          </span>
          <span className="text-border">·</span>
          <span className="tabular-nums">
            {formatPercent(player.stats.winRate)} WR
          </span>
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-sm tabular-nums">
          {formatElo(player.rank.elo)}
        </span>
        <Delta value={player.rank.delta24h} />
      </div>
    </li>
  )
}

export function TopPlayersCard() {
  const [queue, setQueue] = useState<Queue>("1v1")
  const players = (queue === "1v1" ? TOP_PLAYERS_1V1 : TOP_PLAYERS_2V2).slice(0, 6)

  return (
    <PreviewCard
      title="Top players"
      href={`/leaderboards?queue=${queue}`}
      viewAllLabel="view leaderboard"
      meta={
        <div
          role="tablist"
          aria-label="Queue"
          className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5"
        >
          {QUEUES.map((q) => (
            <button
              key={q.id}
              role="tab"
              aria-selected={queue === q.id}
              onClick={() => setQueue(q.id)}
              className={cn(
                "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                queue === q.id
                  ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      }
    >
      <ol className="divide-y divide-border/60">
        {players.map((player, i) => (
          <PlayerRow key={player.id} player={player} index={i} />
        ))}
      </ol>
    </PreviewCard>
  )
}
