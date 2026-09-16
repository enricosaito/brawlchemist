import type { PlayerStats } from "@/lib/brawlhalla-api"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import type { WeaponId } from "@/lib/types"

/**
 * Lifetime legend and weapon records, derived from GetPlayerStats.
 *
 * All of it comes out of one payload the profile already fetches, cached 24h at
 * the fetch layer — so this page costs no Brawlhalla API budget beyond the call
 * a profile view was going to make anyway (cardinal constraint #1).
 *
 * The legend half is exact: the API reports games and wins per legend. The
 * weapon half cannot be, and the difference is the most important thing in this
 * file — see `weaponRows`.
 */

export interface LifetimeLegendRow {
  legendId: number
  slug: string | null
  name: string
  level: number
  xp: number
  games: number
  wins: number
  losses: number
  /** 0-100, or null when they have never played the legend. */
  winRate: number | null
  playtimeHours: number
  /** Share of this player's total matches, 0-100. */
  sharePct: number
}

export interface LifetimeWeaponRow {
  weaponId: WeaponId
  label: string
  /** Exact: summed seconds held across every legend that wields it. */
  timeHeldHours: number
  /** Share of total weapon time, 0-100. Exact. */
  sharePct: number
  /** Attributed, not reported — see the note on `weaponRows`. */
  games: number
  wins: number
  losses: number
  winRate: number | null
}

export interface LifetimeStats {
  level: number
  xp: number
  games: number
  wins: number
  losses: number
  winRate: number | null
  playtimeHours: number
  legends: LifetimeLegendRow[]
  weapons: LifetimeWeaponRow[]
}

/** "rocket-lance" → "Rocket Lance". */
export function weaponLabel(weaponId: WeaponId): string {
  return weaponId
    .split("-")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function rate(wins: number, games: number): number | null {
  return games > 0 ? (wins / games) * 100 : null
}

function legendRows(stats: PlayerStats): LifetimeLegendRow[] {
  const legends = (stats.legends ?? []).filter((l) => (l.games ?? 0) > 0)
  const totalGames = legends.reduce((a, l) => a + (l.games ?? 0), 0)
  return legends
    .map((l): LifetimeLegendRow => {
      const games = l.games ?? 0
      const wins = l.wins ?? 0
      const entry = rosterEntryByLegendId(l.legend_id)
      return {
        legendId: l.legend_id,
        slug: slugForLegendId(l.legend_id),
        // The API's own key is the fallback, so a legend added to the game
        // before it reaches our roster still shows up with a readable name.
        name: entry?.name ?? l.legend_name_key ?? `Legend ${l.legend_id}`,
        level: l.level ?? 0,
        xp: l.xp ?? 0,
        games,
        wins,
        losses: Math.max(games - wins, 0),
        winRate: rate(wins, games),
        playtimeHours: Math.round(((l.matchtime ?? 0) / 3600) * 10) / 10,
        sharePct: totalGames > 0 ? (games / totalGames) * 100 : 0,
      }
    })
    .sort((a, b) => b.games - a.games)
}

/**
 * Weapon records, and the honest caveat that comes with them.
 *
 * **The API does not report wins per weapon.** It reports games and wins per
 * *legend*, and separately how many seconds that legend spent holding each of
 * its two weapons. Every legend wields two, so summing a legend's record into
 * both weapons would double-count every match they ever played.
 *
 * So the record is split between a legend's two weapons in proportion to the
 * time they were held: a Bödvar who spent 70% of his matches on sword
 * contributes 70% of his games and wins to sword and 30% to hammer. Time held
 * and its share are exact; games, wins and losses are an estimate, and the page
 * says so rather than printing them as fact. A stats site that launders an
 * estimate into a number is worse than one that admits the gap.
 */
function weaponRows(stats: PlayerStats): LifetimeWeaponRow[] {
  const acc = new Map<WeaponId, { seconds: number; games: number; wins: number }>()
  const bump = (id: WeaponId, seconds: number, games: number, wins: number) => {
    const cur = acc.get(id) ?? { seconds: 0, games: 0, wins: 0 }
    cur.seconds += seconds
    cur.games += games
    cur.wins += wins
    acc.set(id, cur)
  }

  for (const l of stats.legends ?? []) {
    const entry = rosterEntryByLegendId(l.legend_id)
    if (!entry) continue
    const games = l.games ?? 0
    const wins = l.wins ?? 0
    const t1 = l.timeheldweaponone ?? 0
    const t2 = l.timeheldweapontwo ?? 0
    const total = t1 + t2
    // Split 50/50 when a legend has playtime but no weapon timing recorded,
    // which is what the API returns for very small samples. Halving is the
    // least wrong answer; dropping the legend would quietly lose their games.
    const share1 = total > 0 ? t1 / total : 0.5
    const [w1, w2] = entry.weapons
    bump(w1, t1, games * share1, wins * share1)
    bump(w2, t2, games * (1 - share1), wins * (1 - share1))
  }

  const totalSeconds = [...acc.values()].reduce((a, v) => a + v.seconds, 0)
  return [...acc.entries()]
    .filter(([, v]) => v.games > 0 || v.seconds > 0)
    .map(([weaponId, v]): LifetimeWeaponRow => {
      const games = Math.round(v.games)
      const wins = Math.round(v.wins)
      return {
        weaponId,
        label: weaponLabel(weaponId),
        timeHeldHours: Math.round((v.seconds / 3600) * 10) / 10,
        sharePct: totalSeconds > 0 ? (v.seconds / totalSeconds) * 100 : 0,
        games,
        wins,
        losses: Math.max(games - wins, 0),
        winRate: rate(wins, games),
      }
    })
    .sort((a, b) => b.games - a.games)
}

export function computeLifetimeStats(stats: PlayerStats): LifetimeStats {
  const legends = legendRows(stats)
  const games = stats.games ?? 0
  const wins = stats.wins ?? 0
  return {
    level: stats.level ?? 0,
    xp: stats.xp ?? 0,
    games,
    wins,
    losses: Math.max(games - wins, 0),
    winRate: rate(wins, games),
    playtimeHours: Math.round(
      (stats.legends ?? []).reduce((a, l) => a + (l.matchtime ?? 0), 0) / 3600,
    ),
    legends,
    weapons: weaponRows(stats),
  }
}
