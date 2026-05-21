export type Region = "US-E" | "US-W" | "EU" | "SEA" | "AUS" | "BRZ" | "JPN"

export type Queue = "1v1" | "2v2" | "EXP"

export type Tier =
  | "Tin"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Valhallan"

export type Division = 1 | 2 | 3 | 4 | 5

export type LegendTier = "S+" | "S" | "A" | "B" | "C"

export const LEGEND_TIER_RANK: Record<LegendTier, number> = {
  "S+": 0,
  S: 1,
  A: 2,
  B: 3,
  C: 4,
}

export type WeaponId =
  | "sword"
  | "hammer"
  | "axe"
  | "spear"
  | "katar"
  | "bow"
  | "gauntlets"
  | "scythe"
  | "rocket-lance"
  | "blasters"
  | "greatsword"
  | "cannon"
  | "orb"
  | "battle-boots"

export interface Weapon {
  id: WeaponId
  name: string
  pickRate: number
  winRate: number
  topLegendId: string
  deltaWR: number
}

export interface Legend {
  id: string
  name: string
  weapons: [WeaponId, WeaponId]
  tier: LegendTier
  pickRate: number
  winRate: number
  deltaWR: number
  imageUrl?: string
}

export interface PlayerRank {
  tier: Tier
  division: Division
  elo: number
  peakElo: number
  delta24h: number
}

export interface Player {
  id: string
  name: string
  tag: string
  region: Region
  avatarLegendId: string
  mainLegendIds: string[]
  rank: PlayerRank
  stats: {
    wins: number
    losses: number
    winRate: number
    winStreak: number
  }
}

export interface MatchParticipant {
  playerId: string
  playerName: string
  playerTag: string
  legendId: string
  topWeaponId: WeaponId
  eloChange: number
}

export interface Match {
  id: string
  queue: Queue
  durationSec: number
  endedAt: string // ISO
  region: Region
  winnerIds: string[]
  participants: MatchParticipant[]
}

export interface MetaSnapshot {
  playersOnline: number
  topLegendId: string
  topWeaponId: WeaponId
  averageEloDelta: number
}
