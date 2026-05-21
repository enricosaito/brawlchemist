import type {
  Legend,
  LegendTier,
  Match,
  MetaSnapshot,
  Player,
  Weapon,
  WeaponId,
} from "./types"
import { LEGEND_ROSTER } from "./legends-roster"

export const WEAPON_NAMES: Record<WeaponId, string> = {
  sword: "Sword",
  hammer: "Hammer",
  axe: "Axe",
  spear: "Spear",
  katar: "Katars",
  bow: "Bow",
  gauntlets: "Gauntlets",
  scythe: "Scythe",
  "rocket-lance": "Rocket Lance",
  blasters: "Blasters",
  greatsword: "Greatsword",
  cannon: "Cannon",
  orb: "Orb",
  "battle-boots": "Battle Boots",
}

/**
 * DETAILED_LEGENDS — the hand-curated subset that drives the homepage
 * Top Legends preview. Every entry here keeps its declared tier, win rate,
 * and weapons. All other legends in the roster get deterministic mock
 * stats generated below.
 */
const DETAILED_LEGENDS: Legend[] = [
  { id: "cassidy", name: "Cassidy", weapons: ["hammer", "blasters"], tier: "S+", pickRate: 7.8, winRate: 54.2, deltaWR: 1.6, imageUrl: "/assets/legends/cassidy.png" },
  { id: "tezca", name: "Tezca", weapons: ["gauntlets", "axe"], tier: "S+", pickRate: 5.2, winRate: 53.8, deltaWR: 1.1, imageUrl: "/assets/legends/tezca.png" },
  { id: "caspian", name: "Caspian", weapons: ["katar", "gauntlets"], tier: "S", pickRate: 9.4, winRate: 53.4, deltaWR: 0.8, imageUrl: "/assets/legends/caspian.png" },
  { id: "bodvar", name: "Bödvar", weapons: ["sword", "hammer"], tier: "S", pickRate: 6.1, winRate: 52.5, deltaWR: 0.4, imageUrl: "/assets/legends/bodvar.png" },
  { id: "teros", name: "Teros", weapons: ["hammer", "axe"], tier: "S", pickRate: 4.8, winRate: 51.8, deltaWR: 0.5, imageUrl: "/assets/legends/teros.png" },
  { id: "mordex", name: "Mordex", weapons: ["scythe", "gauntlets"], tier: "A", pickRate: 3.3, winRate: 51.0, deltaWR: 0.2, imageUrl: "/assets/legends/mordex.png" },
  { id: "val", name: "Val", weapons: ["sword", "gauntlets"], tier: "A", pickRate: 4.2, winRate: 50.7, deltaWR: 0.3, imageUrl: "/assets/legends/val.png" },
  { id: "orion", name: "Orion", weapons: ["spear", "rocket-lance"], tier: "A", pickRate: 5.7, winRate: 50.5, deltaWR: -0.1, imageUrl: "/assets/legends/orion.png" },
  { id: "ada", name: "Ada", weapons: ["spear", "blasters"], tier: "A", pickRate: 3.8, winRate: 50.4, deltaWR: 0.7, imageUrl: "/assets/legends/ada.png" },
  { id: "mirage", name: "Mirage", weapons: ["spear", "scythe"], tier: "A", pickRate: 4.9, winRate: 50.2, deltaWR: -0.3, imageUrl: "/assets/legends/mirage.png" },
  { id: "petra", name: "Petra", weapons: ["gauntlets", "orb"], tier: "A", pickRate: 3.5, winRate: 50.0, deltaWR: -0.1, imageUrl: "/assets/legends/petra.png" },
  { id: "lucien", name: "Lucien", weapons: ["katar", "blasters"], tier: "A", pickRate: 3.1, winRate: 49.8, deltaWR: -0.3, imageUrl: "/assets/legends/lucien.png" },
  { id: "diana", name: "Diana", weapons: ["bow", "blasters"], tier: "A", pickRate: 2.9, winRate: 49.7, deltaWR: 0.1, imageUrl: "/assets/legends/diana.png" },
  { id: "hattori", name: "Hattori", weapons: ["sword", "spear"], tier: "B", pickRate: 2.7, winRate: 49.2, deltaWR: 0.6, imageUrl: "/assets/legends/hattori.png" },
  { id: "scarlet", name: "Scarlet", weapons: ["hammer", "rocket-lance"], tier: "B", pickRate: 2.4, winRate: 49.0, deltaWR: -0.4, imageUrl: "/assets/legends/scarlet.png" },
  { id: "ember", name: "Ember", weapons: ["bow", "katar"], tier: "B", pickRate: 2.3, winRate: 48.7, deltaWR: 0.2, imageUrl: "/assets/legends/ember.png" },
  { id: "azoth", name: "Azoth", weapons: ["bow", "scythe"], tier: "B", pickRate: 2.2, winRate: 48.6, deltaWR: 0.0, imageUrl: "/assets/legends/azoth.png" },
  { id: "koji", name: "Koji", weapons: ["sword", "bow"], tier: "B", pickRate: 2.0, winRate: 48.3, deltaWR: -0.2, imageUrl: "/assets/legends/koji.png" },
  { id: "ragnir", name: "Ragnir", weapons: ["axe", "katar"], tier: "B", pickRate: 1.9, winRate: 48.1, deltaWR: 0.3, imageUrl: "/assets/legends/ragnir.png" },
  { id: "gnash", name: "Gnash", weapons: ["hammer", "spear"], tier: "C", pickRate: 1.4, winRate: 47.0, deltaWR: 0.1, imageUrl: "/assets/legends/gnash.png" },
  { id: "lord-vraxx", name: "Lord Vraxx", weapons: ["rocket-lance", "blasters"], tier: "C", pickRate: 1.2, winRate: 46.6, deltaWR: -0.3, imageUrl: "/assets/legends/lord-vraxx.png" },
  { id: "thatch", name: "Thatch", weapons: ["sword", "blasters"], tier: "C", pickRate: 1.1, winRate: 46.2, deltaWR: 0.4, imageUrl: "/assets/legends/thatch.png" },
]

const ALL_WEAPONS_FOR_GEN: WeaponId[] = [
  "sword", "hammer", "axe", "spear", "katar", "bow", "gauntlets",
  "scythe", "rocket-lance", "blasters", "greatsword", "cannon",
  "orb", "battle-boots",
]

const TIER_WR_RANGE: Record<"A" | "B" | "C", [number, number]> = {
  // A capped below Mordex (51.0) so the homepage top 6 stays stable.
  A: [48.5, 50.9],
  B: [47.0, 49.0],
  C: [44.5, 46.9],
}

const TIER_PR_RANGE: Record<"A" | "B" | "C", [number, number]> = {
  A: [1.5, 3.0],
  B: [0.8, 2.0],
  C: [0.3, 1.5],
}

function hashSlug(slug: string): number {
  let h = 2166136261
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickInRange([lo, hi]: [number, number], h: number, shift: number): number {
  const x = ((h >>> shift) % 1000) / 1000
  return lo + x * (hi - lo)
}

/**
 * Generate plausible mock stats for a legend not in the detailed set.
 * No S+ or S tiers are assigned here — those are reserved for the
 * detailed roster so the homepage top 6 order is deterministic.
 */
function generateLegend(slug: string, name: string): Legend {
  const h = hashSlug(slug)
  const tierRoll = h % 100
  const tier: LegendTier =
    tierRoll < 35 ? "A" : tierRoll < 77 ? "B" : "C"

  const winRate = pickInRange(TIER_WR_RANGE[tier], h, 7)
  const pickRate = pickInRange(TIER_PR_RANGE[tier], h, 13)
  const deltaWR = (((h >>> 19) % 31) - 15) / 10 // -1.5 .. +1.5

  const widx1 = h % ALL_WEAPONS_FOR_GEN.length
  let widx2 = (h >>> 5) % ALL_WEAPONS_FOR_GEN.length
  if (widx2 === widx1) widx2 = (widx2 + 1) % ALL_WEAPONS_FOR_GEN.length

  return {
    id: slug,
    name,
    weapons: [ALL_WEAPONS_FOR_GEN[widx1], ALL_WEAPONS_FOR_GEN[widx2]],
    tier,
    pickRate: Number(pickRate.toFixed(1)),
    winRate: Number(winRate.toFixed(1)),
    deltaWR: Number(deltaWR.toFixed(1)),
    imageUrl: `/assets/legends/${slug}.png`,
  }
}

const detailedById = new Map(DETAILED_LEGENDS.map((l) => [l.id, l]))

export const LEGENDS: Legend[] = LEGEND_ROSTER.map(({ slug, name }) =>
  detailedById.get(slug) ?? generateLegend(slug, name),
)

const legendsById = Object.fromEntries(LEGENDS.map((l) => [l.id, l] as const))
export function getLegend(id: string): Legend | undefined {
  return legendsById[id]
}

export const WEAPONS: Weapon[] = [
  { id: "gauntlets", name: "Gauntlets", pickRate: 22.5, winRate: 51.4, topLegendId: "tezca", deltaWR: 1.2 },
  { id: "hammer", name: "Hammer", pickRate: 18.2, winRate: 50.8, topLegendId: "cassidy", deltaWR: 0.7 },
  { id: "sword", name: "Sword", pickRate: 15.7, winRate: 50.6, topLegendId: "bodvar", deltaWR: 0.3 },
  { id: "bow", name: "Bow", pickRate: 13.4, winRate: 49.4, topLegendId: "zariel", deltaWR: 0.4 },
  { id: "katar", name: "Katars", pickRate: 11.9, winRate: 51.7, topLegendId: "asuri", deltaWR: 1.1 },
  { id: "axe", name: "Axe", pickRate: 10.5, winRate: 50.2, topLegendId: "teros", deltaWR: 0.3 },
  { id: "blasters", name: "Blasters", pickRate: 9.8, winRate: 49.8, topLegendId: "diana", deltaWR: 0.5 },
  { id: "spear", name: "Spear", pickRate: 9.2, winRate: 50.0, topLegendId: "orion", deltaWR: -0.4 },
  { id: "scythe", name: "Scythe", pickRate: 8.5, winRate: 49.1, topLegendId: "mirage", deltaWR: -0.2 },
  { id: "rocket-lance", name: "Rocket Lance", pickRate: 7.6, winRate: 48.9, topLegendId: "scarlet", deltaWR: 0.1 },
  { id: "orb", name: "Orb", pickRate: 4.8, winRate: 48.2, topLegendId: "petra", deltaWR: -0.6 },
  { id: "greatsword", name: "Greatsword", pickRate: 3.6, winRate: 48.6, topLegendId: "jaeyun", deltaWR: 0.2 },
  { id: "cannon", name: "Cannon", pickRate: 2.4, winRate: 47.9, topLegendId: "sidra", deltaWR: -0.3 },
  { id: "battle-boots", name: "Battle Boots", pickRate: 1.9, winRate: 48.4, topLegendId: "val", deltaWR: 0.4 },
]

export const TOP_PLAYERS_1V1: Player[] = [
  { id: "p1", name: "Kyna", tag: "Kyna#0001", region: "BRZ", avatarLegendId: "teros", mainLegendIds: ["teros", "tezca"], rank: { tier: "Valhallan", division: 1, elo: 2952, peakElo: 2981, delta24h: 24 }, stats: { wins: 731, losses: 312, winRate: 70.1, winStreak: 6 } },
  { id: "p2", name: "Yüz", tag: "Yüz#0202", region: "BRZ", avatarLegendId: "jaeyun", mainLegendIds: ["jaeyun", "asuri"], rank: { tier: "Valhallan", division: 1, elo: 2897, peakElo: 2920, delta24h: 12 }, stats: { wins: 684, losses: 304, winRate: 69.2, winStreak: 3 } },
  { id: "p3", name: "Wess", tag: "Wess#0103", region: "BRZ", avatarLegendId: "tezca", mainLegendIds: ["tezca", "ada"], rank: { tier: "Valhallan", division: 1, elo: 2854, peakElo: 2871, delta24h: -7 }, stats: { wins: 632, losses: 289, winRate: 68.6, winStreak: 0 } },
  { id: "p4", name: "Godly", tag: "Godly#0404", region: "EU", avatarLegendId: "petra", mainLegendIds: ["petra", "azoth"], rank: { tier: "Valhallan", division: 1, elo: 2811, peakElo: 2832, delta24h: 9 }, stats: { wins: 597, losses: 281, winRate: 68.0, winStreak: 4 } },
  { id: "p5", name: "Sandstorm", tag: "Sandstorm#7421", region: "US-E", avatarLegendId: "mordex", mainLegendIds: ["mordex", "val"], rank: { tier: "Valhallan", division: 1, elo: 2768, peakElo: 2790, delta24h: 5 }, stats: { wins: 561, losses: 268, winRate: 67.7, winStreak: 2 } },
  { id: "p6", name: "Enrico", tag: "Enrico#1313", region: "BRZ", avatarLegendId: "bodvar", mainLegendIds: ["bodvar", "caspian"], rank: { tier: "Diamond", division: 5, elo: 2691, peakElo: 2708, delta24h: 16 }, stats: { wins: 484, losses: 251, winRate: 65.9, winStreak: 3 } },
]

export const TOP_PLAYERS_2V2: Player[] = [
  { id: "d1", name: "Halcyon", tag: "Halcyon#0202", region: "EU", avatarLegendId: "caspian", mainLegendIds: ["caspian", "mirage"], rank: { tier: "Valhallan", division: 1, elo: 2698, peakElo: 2745, delta24h: 16 }, stats: { wins: 421, losses: 219, winRate: 65.8, winStreak: 4 } },
  { id: "d2", name: "Vesper", tag: "Vesper#5512", region: "US-E", avatarLegendId: "ada", mainLegendIds: ["ada", "petra"], rank: { tier: "Diamond", division: 5, elo: 2654, peakElo: 2670, delta24h: 7 }, stats: { wins: 388, losses: 211, winRate: 64.8, winStreak: 0 } },
  { id: "d3", name: "Nyx", tag: "Nyx#8081", region: "EU", avatarLegendId: "mordex", mainLegendIds: ["mordex", "azoth"], rank: { tier: "Diamond", division: 5, elo: 2641, peakElo: 2649, delta24h: -5 }, stats: { wins: 372, losses: 207, winRate: 64.2, winStreak: 1 } },
  { id: "d4", name: "Zephyr", tag: "Zephyr#1010", region: "US-W", avatarLegendId: "val", mainLegendIds: ["val", "bodvar"], rank: { tier: "Diamond", division: 4, elo: 2612, peakElo: 2630, delta24h: 11 }, stats: { wins: 354, losses: 198, winRate: 64.1, winStreak: 3 } },
  { id: "d5", name: "Orla", tag: "Orla#3333", region: "EU", avatarLegendId: "ember", mainLegendIds: ["ember", "diana"], rank: { tier: "Diamond", division: 4, elo: 2598, peakElo: 2610, delta24h: 2 }, stats: { wins: 341, losses: 192, winRate: 64.0, winStreak: 0 } },
  { id: "d6", name: "Pyrrha", tag: "Pyrrha#4422", region: "BRZ", avatarLegendId: "petra", mainLegendIds: ["petra", "ada"], rank: { tier: "Diamond", division: 4, elo: 2575, peakElo: 2588, delta24h: -2 }, stats: { wins: 327, losses: 184, winRate: 64.0, winStreak: 0 } },
  { id: "d7", name: "Aether", tag: "Aether#7777", region: "SEA", avatarLegendId: "orion", mainLegendIds: ["orion", "scarlet"], rank: { tier: "Diamond", division: 3, elo: 2552, peakElo: 2561, delta24h: 4 }, stats: { wins: 308, losses: 174, winRate: 63.9, winStreak: 2 } },
]

export const RECENT_MATCHES: Match[] = [
  {
    id: "m1",
    queue: "1v1",
    durationSec: 132,
    endedAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    region: "EU",
    winnerIds: ["p1"],
    participants: [
      { playerId: "p1", playerName: "Phazon", playerTag: "Phazon#0001", legendId: "caspian", topWeaponId: "katar", eloChange: 18 },
      { playerId: "p9", playerName: "Solace", playerTag: "Solace#0090", legendId: "orion", topWeaponId: "spear", eloChange: -18 },
    ],
  },
  {
    id: "m2",
    queue: "2v2",
    durationSec: 188,
    endedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    region: "EU",
    winnerIds: ["d1", "d3"],
    participants: [
      { playerId: "d1", playerName: "Halcyon", playerTag: "Halcyon#0202", legendId: "caspian", topWeaponId: "gauntlets", eloChange: 14 },
      { playerId: "d3", playerName: "Nyx", playerTag: "Nyx#8081", legendId: "mordex", topWeaponId: "scythe", eloChange: 14 },
      { playerId: "x1", playerName: "Cobalt", playerTag: "Cobalt#1010", legendId: "bodvar", topWeaponId: "hammer", eloChange: -14 },
      { playerId: "x2", playerName: "Ember", playerTag: "Ember#1212", legendId: "ada", topWeaponId: "blasters", eloChange: -14 },
    ],
  },
  {
    id: "m3",
    queue: "1v1",
    durationSec: 96,
    endedAt: new Date(Date.now() - 1000 * 60 * 21).toISOString(),
    region: "US-E",
    winnerIds: ["p2"],
    participants: [
      { playerId: "p2", playerName: "Sandstorm", playerTag: "Sandstorm#7421", legendId: "orion", topWeaponId: "spear", eloChange: 21 },
      { playerId: "p12", playerName: "Tide", playerTag: "Tide#5050", legendId: "val", topWeaponId: "sword", eloChange: -21 },
    ],
  },
  {
    id: "m4",
    queue: "1v1",
    durationSec: 215,
    endedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    region: "BRZ",
    winnerIds: ["p13"],
    participants: [
      { playerId: "p13", playerName: "Ravel", playerTag: "Ravel#0707", legendId: "mirage", topWeaponId: "scythe", eloChange: 17 },
      { playerId: "p6", playerName: "Kasper", playerTag: "Kasper#0440", legendId: "val", topWeaponId: "gauntlets", eloChange: -17 },
    ],
  },
  {
    id: "m5",
    queue: "2v2",
    durationSec: 154,
    endedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    region: "SEA",
    winnerIds: ["p4", "p14"],
    participants: [
      { playerId: "p4", playerName: "Wisp", playerTag: "Wisp#1188", legendId: "petra", topWeaponId: "orb", eloChange: 12 },
      { playerId: "p14", playerName: "Frost", playerTag: "Frost#0303", legendId: "azoth", topWeaponId: "bow", eloChange: 12 },
      { playerId: "x3", playerName: "Helix", playerTag: "Helix#9090", legendId: "lucien", topWeaponId: "katar", eloChange: -12 },
      { playerId: "x4", playerName: "Mira", playerTag: "Mira#2222", legendId: "diana", topWeaponId: "bow", eloChange: -12 },
    ],
  },
  {
    id: "m6",
    queue: "1v1",
    durationSec: 124,
    endedAt: new Date(Date.now() - 1000 * 60 * 56).toISOString(),
    region: "EU",
    winnerIds: ["p7"],
    participants: [
      { playerId: "p7", playerName: "Rune", playerTag: "Rune#0006", legendId: "azoth", topWeaponId: "scythe", eloChange: 15 },
      { playerId: "p15", playerName: "Kite", playerTag: "Kite#1234", legendId: "ember", topWeaponId: "bow", eloChange: -15 },
    ],
  },
]

export const META_SNAPSHOT: MetaSnapshot = {
  playersOnline: 48214,
  topLegendId: "caspian",
  topWeaponId: "spear",
  averageEloDelta: 0.4,
}

export const TRENDING_LEGEND_IDS = ["caspian", "bodvar", "orion", "mirage"]

export const CURRENT_PATCH = "10.07"
