import type { WeaponId } from "./types"

/**
 * Canonical Brawlhalla legend roster (68 entries) as of patch 10.07.
 *
 * - `slug` matches the directory under public/assets/legends and is used
 *   throughout the UI to look up portraits.
 * - `legendId` is the integer ID returned by the Brawlhalla v1 API in
 *   GetPlayerStats / GetLegend. Refresh via scripts/scrape-legends.mjs +
 *   /legend/all when the roster grows.
 * - `weapons` is the canonical pair of weapons each legend wields.
 *   Sourced from the user's tier-list. The /weapons page derives its data
 *   from this mapping; do not let the mock-data fall out of sync with this.
 *
 * Ransom / Lady Vera / Rupture weapons are placeholders pending user
 * confirmation — TODO mark them out below.
 */
export interface RosterEntry {
  slug: string
  name: string
  legendId: number
  weapons: [WeaponId, WeaponId]
}

export const LEGEND_ROSTER: RosterEntry[] = [
  { slug: "bodvar", name: "Bödvar", legendId: 3, weapons: ["sword", "hammer"] },
  { slug: "cassidy", name: "Cassidy", legendId: 4, weapons: ["blasters", "hammer"] },
  { slug: "orion", name: "Orion", legendId: 5, weapons: ["rocket-lance", "spear"] },
  { slug: "lord-vraxx", name: "Lord Vraxx", legendId: 6, weapons: ["rocket-lance", "blasters"] },
  { slug: "gnash", name: "Gnash", legendId: 7, weapons: ["hammer", "spear"] },
  { slug: "queen-nai", name: "Queen Nai", legendId: 8, weapons: ["katar", "spear"] },
  { slug: "hattori", name: "Hattori", legendId: 10, weapons: ["sword", "spear"] },
  { slug: "sir-roland", name: "Sir Roland", legendId: 11, weapons: ["rocket-lance", "sword"] },
  { slug: "scarlet", name: "Scarlet", legendId: 12, weapons: ["hammer", "rocket-lance"] },
  { slug: "thatch", name: "Thatch", legendId: 13, weapons: ["blasters", "sword"] },
  { slug: "ada", name: "Ada", legendId: 14, weapons: ["blasters", "spear"] },
  { slug: "sentinel", name: "Sentinel", legendId: 15, weapons: ["hammer", "katar"] },
  { slug: "lucien", name: "Lucien", legendId: 9, weapons: ["katar", "blasters"] },
  { slug: "teros", name: "Teros", legendId: 16, weapons: ["axe", "hammer"] },
  { slug: "brynn", name: "Brynn", legendId: 19, weapons: ["axe", "spear"] },
  { slug: "asuri", name: "Asuri", legendId: 20, weapons: ["katar", "sword"] },
  { slug: "barraza", name: "Barraza", legendId: 21, weapons: ["axe", "blasters"] },
  { slug: "ember", name: "Ember", legendId: 18, weapons: ["bow", "katar"] },
  { slug: "azoth", name: "Azoth", legendId: 23, weapons: ["bow", "axe"] },
  { slug: "koji", name: "Koji", legendId: 24, weapons: ["bow", "sword"] },
  { slug: "ulgrim", name: "Ulgrim", legendId: 22, weapons: ["axe", "rocket-lance"] },
  { slug: "diana", name: "Diana", legendId: 25, weapons: ["bow", "blasters"] },
  { slug: "jhala", name: "Jhala", legendId: 26, weapons: ["axe", "sword"] },
  { slug: "kor", name: "Kor", legendId: 28, weapons: ["gauntlets", "hammer"] },
  { slug: "wu-shang", name: "Wu Shang", legendId: 29, weapons: ["gauntlets", "spear"] },
  { slug: "val", name: "Val", legendId: 30, weapons: ["gauntlets", "sword"] },
  { slug: "ragnir", name: "Ragnir", legendId: 31, weapons: ["katar", "axe"] },
  { slug: "cross", name: "Cross", legendId: 32, weapons: ["blasters", "gauntlets"] },
  { slug: "mirage", name: "Mirage", legendId: 33, weapons: ["spear", "scythe"] },
  { slug: "nix", name: "Nix", legendId: 34, weapons: ["blasters", "scythe"] },
  { slug: "mordex", name: "Mordex", legendId: 35, weapons: ["gauntlets", "scythe"] },
  { slug: "yumiko", name: "Yumiko", legendId: 36, weapons: ["bow", "hammer"] },
  { slug: "artemis", name: "Artemis", legendId: 37, weapons: ["rocket-lance", "scythe"] },
  { slug: "caspian", name: "Caspian", legendId: 38, weapons: ["gauntlets", "katar"] },
  { slug: "sidra", name: "Sidra", legendId: 39, weapons: ["cannon", "sword"] },
  { slug: "xull", name: "Xull", legendId: 40, weapons: ["axe", "cannon"] },
  { slug: "kaya", name: "Kaya", legendId: 42, weapons: ["spear", "bow"] },
  { slug: "isaiah", name: "Isaiah", legendId: 41, weapons: ["cannon", "blasters"] },
  { slug: "jiro", name: "Jiro", legendId: 43, weapons: ["sword", "scythe"] },
  { slug: "lin-fei", name: "Lin Fei", legendId: 44, weapons: ["katar", "cannon"] },
  { slug: "zariel", name: "Zariel", legendId: 45, weapons: ["bow", "gauntlets"] },
  { slug: "rayman", name: "Rayman", legendId: 46, weapons: ["gauntlets", "axe"] },
  { slug: "dusk", name: "Dusk", legendId: 47, weapons: ["orb", "spear"] },
  { slug: "fait", name: "Fait", legendId: 48, weapons: ["orb", "scythe"] },
  { slug: "thor", name: "Thor", legendId: 49, weapons: ["hammer", "orb"] },
  { slug: "petra", name: "Petra", legendId: 50, weapons: ["gauntlets", "orb"] },
  { slug: "vector", name: "Vector", legendId: 51, weapons: ["rocket-lance", "bow"] },
  { slug: "volkov", name: "Volkov", legendId: 52, weapons: ["scythe", "axe"] },
  { slug: "onyx", name: "Onyx", legendId: 53, weapons: ["cannon", "gauntlets"] },
  { slug: "jaeyun", name: "Jaeyun", legendId: 54, weapons: ["greatsword", "sword"] },
  { slug: "mako", name: "Mako", legendId: 55, weapons: ["greatsword", "katar"] },
  { slug: "magyar", name: "Magyar", legendId: 56, weapons: ["greatsword", "hammer"] },
  { slug: "reno", name: "Reno", legendId: 57, weapons: ["blasters", "orb"] },
  { slug: "munin", name: "Munin", legendId: 58, weapons: ["bow", "scythe"] },
  { slug: "arcadia", name: "Arcadia", legendId: 59, weapons: ["greatsword", "spear"] },
  { slug: "ezio", name: "Ezio", legendId: 60, weapons: ["sword", "orb"] },
  { slug: "tezca", name: "Tezca", legendId: 63, weapons: ["battle-boots", "gauntlets"] },
  { slug: "thea", name: "Thea", legendId: 62, weapons: ["battle-boots", "rocket-lance"] },
  { slug: "red-raptor", name: "Red Raptor", legendId: 17, weapons: ["battle-boots", "orb"] },
  { slug: "loki", name: "Loki", legendId: 27, weapons: ["katar", "scythe"] },
  { slug: "seven", name: "Seven", legendId: 61, weapons: ["spear", "cannon"] },
  { slug: "vivi", name: "Vivi", legendId: 64, weapons: ["blasters", "battle-boots"] },
  { slug: "imugi", name: "Imugi", legendId: 65, weapons: ["axe", "cannon"] },
  { slug: "king-zuva", name: "King Zuva", legendId: 66, weapons: ["hammer", "battle-boots"] },
  { slug: "priya", name: "Priya", legendId: 67, weapons: ["chakram", "spear"] },
  // TODO: confirm weapons for the three newest legends with user.
  { slug: "ransom", name: "Ransom", legendId: 68, weapons: ["greatsword", "bow"] },
  { slug: "lady-vera", name: "Lady Vera", legendId: 69, weapons: ["chakram", "orb"] },
  { slug: "rupture", name: "Rupture", legendId: 70, weapons: ["hammer", "battle-boots"] },
]

const SLUG_BY_LEGEND_ID = new Map<number, string>(
  LEGEND_ROSTER.map((l) => [l.legendId, l.slug]),
)

const LEGEND_ID_BY_SLUG = new Map<string, number>(
  LEGEND_ROSTER.map((l) => [l.slug, l.legendId]),
)

const ROSTER_BY_SLUG = new Map<string, RosterEntry>(
  LEGEND_ROSTER.map((l) => [l.slug, l]),
)

const ROSTER_BY_ID = new Map<number, RosterEntry>(
  LEGEND_ROSTER.map((l) => [l.legendId, l]),
)

export function slugForLegendId(legendId: number): string | null {
  return SLUG_BY_LEGEND_ID.get(legendId) ?? null
}

export function legendIdForSlug(slug: string): number | null {
  return LEGEND_ID_BY_SLUG.get(slug) ?? null
}

export function rosterEntryBySlug(slug: string): RosterEntry | null {
  return ROSTER_BY_SLUG.get(slug) ?? null
}

export function rosterEntryByLegendId(legendId: number): RosterEntry | null {
  return ROSTER_BY_ID.get(legendId) ?? null
}

/** Distinct weapons across the entire roster, in their first-seen order. */
export const ROSTER_WEAPONS: WeaponId[] = (() => {
  const seen = new Set<WeaponId>()
  const out: WeaponId[] = []
  for (const l of LEGEND_ROSTER) {
    for (const w of l.weapons) {
      if (!seen.has(w)) {
        seen.add(w)
        out.push(w)
      }
    }
  }
  return out
})()

/** All legends that wield the given weapon. */
export function legendsForWeapon(weapon: WeaponId): RosterEntry[] {
  return LEGEND_ROSTER.filter((l) => l.weapons.includes(weapon))
}
