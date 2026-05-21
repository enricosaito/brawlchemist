import type {
  Legend,
  Match,
  MetaSnapshot,
  Player,
  Weapon,
  WeaponId,
} from "./types"

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

export const LEGENDS: Legend[] = [
  { id: "caspian", name: "Caspian", weapons: ["katar", "gauntlets"], tier: "S", pickRate: 9.4, winRate: 53.8, deltaWR: 1.2, imageUrl: "/assets/legends/caspian.png" },
  { id: "bodvar", name: "Bödvar", weapons: ["sword", "hammer"], tier: "S", pickRate: 6.1, winRate: 52.1, deltaWR: 0.4, imageUrl: "/assets/legends/bodvar.png" },
  { id: "orion", name: "Orion", weapons: ["spear", "rocket-lance"], tier: "S", pickRate: 5.7, winRate: 51.6, deltaWR: 0.9, imageUrl: "/assets/legends/orion.png" },
  { id: "mirage", name: "Mirage", weapons: ["spear", "scythe"], tier: "S", pickRate: 4.9, winRate: 51.4, deltaWR: -0.2, imageUrl: "/assets/legends/mirage.png" },
  { id: "val", name: "Val", weapons: ["sword", "gauntlets"], tier: "A", pickRate: 4.2, winRate: 50.9, deltaWR: 0.3, imageUrl: "/assets/legends/val.png" },
  { id: "ada", name: "Ada", weapons: ["spear", "blasters"], tier: "A", pickRate: 3.8, winRate: 50.4, deltaWR: 0.7, imageUrl: "/assets/legends/ada.png" },
  { id: "petra", name: "Petra", weapons: ["gauntlets", "orb"], tier: "A", pickRate: 3.5, winRate: 50.2, deltaWR: -0.1, imageUrl: "/assets/legends/petra.png" },
  { id: "mordex", name: "Mordex", weapons: ["scythe", "gauntlets"], tier: "A", pickRate: 3.3, winRate: 50.0, deltaWR: 0.2, imageUrl: "/assets/legends/mordex.png" },
  { id: "lucien", name: "Lucien", weapons: ["katar", "blasters"], tier: "A", pickRate: 3.1, winRate: 49.8, deltaWR: -0.3, imageUrl: "/assets/legends/lucien.png" },
  { id: "diana", name: "Diana", weapons: ["bow", "blasters"], tier: "A", pickRate: 2.9, winRate: 49.7, deltaWR: 0.1, imageUrl: "/assets/legends/diana.png" },
  { id: "hattori", name: "Hattori", weapons: ["sword", "spear"], tier: "B", pickRate: 2.7, winRate: 49.2, deltaWR: 0.6, imageUrl: "/assets/legends/hattori.png" },
  { id: "scarlet", name: "Scarlet", weapons: ["hammer", "rocket-lance"], tier: "B", pickRate: 2.4, winRate: 49.0, deltaWR: -0.4, imageUrl: "/assets/legends/scarlet.png" },
  { id: "ember", name: "Ember", weapons: ["bow", "katar"], tier: "B", pickRate: 2.3, winRate: 48.7, deltaWR: 0.2, imageUrl: "/assets/legends/ember.png" },
  { id: "azoth", name: "Azoth", weapons: ["bow", "scythe"], tier: "B", pickRate: 2.2, winRate: 48.6, deltaWR: 0.0, imageUrl: "/assets/legends/azoth.png" },
  { id: "koji", name: "Koji", weapons: ["sword", "bow"], tier: "B", pickRate: 2.0, winRate: 48.3, deltaWR: -0.2, imageUrl: "/assets/legends/koji.png" },
  { id: "ragnir", name: "Ragnir", weapons: ["axe", "katar"], tier: "B", pickRate: 1.9, winRate: 48.1, deltaWR: 0.3, imageUrl: "/assets/legends/ragnir.png" },
  { id: "cassidy", name: "Cassidy", weapons: ["hammer", "blasters"], tier: "S", pickRate: 5.5, winRate: 53.6, deltaWR: 1.4, imageUrl: "/assets/legends/cassidy.png" },
  { id: "gnash", name: "Gnash", weapons: ["hammer", "spear"], tier: "C", pickRate: 1.4, winRate: 47.0, deltaWR: 0.1, imageUrl: "/assets/legends/gnash.png" },
  { id: "lord-vraxx", name: "Lord Vraxx", weapons: ["rocket-lance", "blasters"], tier: "C", pickRate: 1.2, winRate: 46.6, deltaWR: -0.3, imageUrl: "/assets/legends/lord-vraxx.png" },
  { id: "thatch", name: "Thatch", weapons: ["sword", "blasters"], tier: "C", pickRate: 1.1, winRate: 46.2, deltaWR: 0.4, imageUrl: "/assets/legends/thatch.png" },
]

const legendsById = Object.fromEntries(LEGENDS.map((l) => [l.id, l] as const))
export function getLegend(id: string): Legend | undefined {
  return legendsById[id]
}

export const WEAPONS: Weapon[] = [
  { id: "spear", name: "Spear", pickRate: 21.4, winRate: 51.2, topLegendId: "orion", deltaWR: 0.8 },
  { id: "sword", name: "Sword", pickRate: 18.9, winRate: 50.6, topLegendId: "bodvar", deltaWR: 0.3 },
  { id: "hammer", name: "Hammer", pickRate: 14.2, winRate: 50.1, topLegendId: "bodvar", deltaWR: -0.4 },
  { id: "blasters", name: "Blasters", pickRate: 12.7, winRate: 49.8, topLegendId: "diana", deltaWR: 0.5 },
  { id: "axe", name: "Axe", pickRate: 11.8, winRate: 49.6, topLegendId: "ragnir", deltaWR: 0.2 },
  { id: "katar", name: "Katars", pickRate: 10.4, winRate: 51.7, topLegendId: "caspian", deltaWR: 1.1 },
  { id: "gauntlets", name: "Gauntlets", pickRate: 9.8, winRate: 50.4, topLegendId: "caspian", deltaWR: 0.6 },
  { id: "scythe", name: "Scythe", pickRate: 8.5, winRate: 49.1, topLegendId: "mirage", deltaWR: -0.2 },
  { id: "rocket-lance", name: "Rocket Lance", pickRate: 7.6, winRate: 48.9, topLegendId: "scarlet", deltaWR: 0.1 },
  { id: "bow", name: "Bow", pickRate: 7.1, winRate: 49.4, topLegendId: "diana", deltaWR: 0.3 },
  { id: "orb", name: "Orb", pickRate: 4.8, winRate: 48.2, topLegendId: "petra", deltaWR: -0.6 },
  { id: "greatsword", name: "Greatsword", pickRate: 3.6, winRate: 48.6, topLegendId: "bodvar", deltaWR: 0.2 },
  { id: "cannon", name: "Cannon", pickRate: 2.4, winRate: 47.9, topLegendId: "cassidy", deltaWR: -0.3 },
  { id: "battle-boots", name: "Battle Boots", pickRate: 1.9, winRate: 48.4, topLegendId: "val", deltaWR: 0.4 },
]

export const TOP_PLAYERS_1V1: Player[] = [
  { id: "p1", name: "Phazon", tag: "Phazon#0001", region: "EU", avatarLegendId: "caspian", mainLegendIds: ["caspian", "bodvar", "mirage"], rank: { tier: "Valhallan", division: 1, elo: 2854, peakElo: 2911, delta24h: 23 }, stats: { wins: 612, losses: 311, winRate: 66.3, winStreak: 5 } },
  { id: "p2", name: "Sandstorm", tag: "Sandstorm#7421", region: "US-E", avatarLegendId: "orion", mainLegendIds: ["orion", "val", "ada"], rank: { tier: "Valhallan", division: 1, elo: 2811, peakElo: 2840, delta24h: -8 }, stats: { wins: 588, losses: 304, winRate: 65.9, winStreak: 0 } },
  { id: "p3", name: "Boomie", tag: "Boomie#3032", region: "US-E", avatarLegendId: "bodvar", mainLegendIds: ["bodvar", "scarlet"], rank: { tier: "Diamond", division: 5, elo: 2790, peakElo: 2802, delta24h: 14 }, stats: { wins: 502, losses: 268, winRate: 65.2, winStreak: 3 } },
  { id: "p4", name: "Wisp", tag: "Wisp#1188", region: "SEA", avatarLegendId: "petra", mainLegendIds: ["petra", "ada", "azoth"], rank: { tier: "Diamond", division: 5, elo: 2742, peakElo: 2755, delta24h: 4 }, stats: { wins: 477, losses: 261, winRate: 64.6, winStreak: 0 } },
  { id: "p5", name: "Diana", tag: "Diana#9119", region: "EU", avatarLegendId: "mirage", mainLegendIds: ["mirage", "orion"], rank: { tier: "Diamond", division: 5, elo: 2733, peakElo: 2741, delta24h: 9 }, stats: { wins: 461, losses: 253, winRate: 64.6, winStreak: 4 } },
  { id: "p6", name: "Kasper", tag: "Kasper#0440", region: "BRZ", avatarLegendId: "val", mainLegendIds: ["val", "lucien"], rank: { tier: "Diamond", division: 4, elo: 2701, peakElo: 2712, delta24h: -3 }, stats: { wins: 418, losses: 232, winRate: 64.3, winStreak: 0 } },
  { id: "p7", name: "Rune", tag: "Rune#0006", region: "EU", avatarLegendId: "azoth", mainLegendIds: ["azoth", "ember"], rank: { tier: "Diamond", division: 4, elo: 2688, peakElo: 2701, delta24h: 6 }, stats: { wins: 401, losses: 224, winRate: 64.2, winStreak: 2 } },
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
