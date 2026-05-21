/**
 * Canonical Brawlhalla legend roster (68 entries) as of patch 10.07.
 *
 * - `slug` matches the directory under public/assets/legends and is used
 *   throughout the UI to look up portraits.
 * - `legendId` is the integer ID returned by the Brawlhalla v1 API in
 *   GetPlayerStats / GetLegend. Refresh via scripts/scrape-legends.mjs +
 *   /legend/all when the roster grows.
 */
export interface RosterEntry {
  slug: string
  name: string
  legendId: number
}

export const LEGEND_ROSTER: RosterEntry[] = [
  { slug: "bodvar", name: "Bödvar", legendId: 3 },
  { slug: "cassidy", name: "Cassidy", legendId: 4 },
  { slug: "orion", name: "Orion", legendId: 5 },
  { slug: "lord-vraxx", name: "Lord Vraxx", legendId: 6 },
  { slug: "gnash", name: "Gnash", legendId: 7 },
  { slug: "queen-nai", name: "Queen Nai", legendId: 8 },
  { slug: "hattori", name: "Hattori", legendId: 10 },
  { slug: "sir-roland", name: "Sir Roland", legendId: 11 },
  { slug: "scarlet", name: "Scarlet", legendId: 12 },
  { slug: "thatch", name: "Thatch", legendId: 13 },
  { slug: "ada", name: "Ada", legendId: 14 },
  { slug: "sentinel", name: "Sentinel", legendId: 15 },
  { slug: "lucien", name: "Lucien", legendId: 9 },
  { slug: "teros", name: "Teros", legendId: 16 },
  { slug: "brynn", name: "Brynn", legendId: 19 },
  { slug: "asuri", name: "Asuri", legendId: 20 },
  { slug: "barraza", name: "Barraza", legendId: 21 },
  { slug: "ember", name: "Ember", legendId: 18 },
  { slug: "azoth", name: "Azoth", legendId: 23 },
  { slug: "koji", name: "Koji", legendId: 24 },
  { slug: "ulgrim", name: "Ulgrim", legendId: 22 },
  { slug: "diana", name: "Diana", legendId: 25 },
  { slug: "jhala", name: "Jhala", legendId: 26 },
  { slug: "kor", name: "Kor", legendId: 28 },
  { slug: "wu-shang", name: "Wu Shang", legendId: 29 },
  { slug: "val", name: "Val", legendId: 30 },
  { slug: "ragnir", name: "Ragnir", legendId: 31 },
  { slug: "cross", name: "Cross", legendId: 32 },
  { slug: "mirage", name: "Mirage", legendId: 33 },
  { slug: "nix", name: "Nix", legendId: 34 },
  { slug: "mordex", name: "Mordex", legendId: 35 },
  { slug: "yumiko", name: "Yumiko", legendId: 36 },
  { slug: "artemis", name: "Artemis", legendId: 37 },
  { slug: "caspian", name: "Caspian", legendId: 38 },
  { slug: "sidra", name: "Sidra", legendId: 39 },
  { slug: "xull", name: "Xull", legendId: 40 },
  { slug: "kaya", name: "Kaya", legendId: 42 },
  { slug: "isaiah", name: "Isaiah", legendId: 41 },
  { slug: "jiro", name: "Jiro", legendId: 43 },
  { slug: "lin-fei", name: "Lin Fei", legendId: 44 },
  { slug: "zariel", name: "Zariel", legendId: 45 },
  { slug: "rayman", name: "Rayman", legendId: 46 },
  { slug: "dusk", name: "Dusk", legendId: 47 },
  { slug: "fait", name: "Fait", legendId: 48 },
  { slug: "thor", name: "Thor", legendId: 49 },
  { slug: "petra", name: "Petra", legendId: 50 },
  { slug: "vector", name: "Vector", legendId: 51 },
  { slug: "volkov", name: "Volkov", legendId: 52 },
  { slug: "onyx", name: "Onyx", legendId: 53 },
  { slug: "jaeyun", name: "Jaeyun", legendId: 54 },
  { slug: "mako", name: "Mako", legendId: 55 },
  { slug: "magyar", name: "Magyar", legendId: 56 },
  { slug: "reno", name: "Reno", legendId: 57 },
  { slug: "munin", name: "Munin", legendId: 58 },
  { slug: "arcadia", name: "Arcadia", legendId: 59 },
  { slug: "ezio", name: "Ezio", legendId: 60 },
  { slug: "tezca", name: "Tezca", legendId: 63 },
  { slug: "thea", name: "Thea", legendId: 62 },
  { slug: "red-raptor", name: "Red Raptor", legendId: 17 },
  { slug: "loki", name: "Loki", legendId: 27 },
  { slug: "seven", name: "Seven", legendId: 61 },
  { slug: "vivi", name: "Vivi", legendId: 64 },
  { slug: "imugi", name: "Imugi", legendId: 65 },
  { slug: "king-zuva", name: "King Zuva", legendId: 66 },
  { slug: "priya", name: "Priya", legendId: 67 },
  { slug: "ransom", name: "Ransom", legendId: 68 },
  { slug: "lady-vera", name: "Lady Vera", legendId: 69 },
  { slug: "rupture", name: "Rupture", legendId: 70 },
]

const SLUG_BY_LEGEND_ID = new Map<number, string>(
  LEGEND_ROSTER.map((l) => [l.legendId, l.slug]),
)

export function slugForLegendId(legendId: number): string | null {
  return SLUG_BY_LEGEND_ID.get(legendId) ?? null
}
