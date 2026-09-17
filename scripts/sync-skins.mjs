// Rebuild the Brawlhalla skin catalogue from brawlhalla.wiki.gg.
//
// Usage: node scripts/sync-skins.mjs [--out lib/skins-catalogue.json]
//
// Writes a legend -> skins map used by the favorite-skin picker. Run it by hand
// when Blue Mammoth ships skins; there is no cron, because the catalogue changes
// a handful of times a year and a stale entry costs nothing worse than a skin
// missing from the picker.
//
// Two sweeps, not one. The wiki names the icon and the art differently, and the
// difference is not derivable:
//
//   icon : File:SkinIcon Lin Fei AceSpiker.png     <- skin name compressed
//   art  : File:Ace Spiker Lin Fei.png             <- skin name spaced, order flipped
//
// Deriving the art filename from the icon resolves 10 of 34 sampled skins, so
// both categories get listed and matched by a folded key instead.
//
// The wiki returns 429 to anything that does not look like a browser, which is
// why this sends a real User-Agent. It is a handful of requests run by hand, not
// a crawler.

import fs from "node:fs"
import path from "node:path"

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const API = "https://brawlhalla.wiki.gg/api.php"

const outArg = process.argv.indexOf("--out")
const OUT = outArg > -1 ? process.argv[outArg + 1] : "lib/skins-catalogue.json"

/** Folded to match across spelling drift: "Bodvar" here, "Bödvar" in our roster. */
const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()

async function categoryFiles(category) {
  const out = []
  let cont = {}
  for (let page = 0; page < 30; page++) {
    const qs = new URLSearchParams({
      action: "query",
      format: "json",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "file",
      cmlimit: "500",
      ...cont,
    })
    const res = await fetch(`${API}?${qs}`, { headers: { "User-Agent": UA } })
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`)
    const json = await res.json()
    out.push(...(json.query?.categorymembers ?? []).map((m) => m.title))
    if (!json.continue) return out
    cont = json.continue
  }
  throw new Error(`${category}: did not finish paginating`)
}

function rosterNames() {
  const src = fs.readFileSync("lib/legends-roster.ts", "utf8")
  return [...src.matchAll(/name: "([^"]+)"/g)].map((m) => m[1])
}

const ICON = /^File:(?:Ani)?SkinIcon (.+?)\.(?:png|gif)$/
const ART = /^File:(.+?)\.(?:png|gif)$/

const [icons, arts] = await Promise.all([
  categoryFiles("Skin icons"),
  categoryFiles("Skin images"),
])

const roster = rosterNames()
// Longest first so "Queen Nai" wins over a legend whose name is a prefix.
const folded = roster
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((name) => [name, fold(name)])

/** Split "<Legend><Skin>" (already folded) into the roster legend and the rest. */
function splitLegend(rest) {
  const key = fold(rest)
  const hit = folded.find(([, f]) => key === f || key.startsWith(f))
  if (!hit) return null
  // Walk the raw string until we have consumed as many alphanumerics as the
  // legend's folded name, so the skin keeps its original spacing and case.
  let seen = 0
  let cut = 0
  for (let i = 0; i < rest.length && seen < hit[1].length; i++) {
    if (/[a-z0-9]/i.test(rest[i])) seen++
    cut = i + 1
  }
  return { legend: hit[0], skin: rest.slice(cut).trim() || "Classic" }
}

/** "File:Foo Bar.png" -> "Foo_Bar.png", which is the /images/ path verbatim. */
const toFile = (title) => title.replace(/^File:/, "").replace(/ /g, "_")

// ---- icons: the picker grid -------------------------------------------------
const skins = new Map() // legend -> Map(foldedSkin -> entry)
let skippedIcons = 0
for (const title of icons) {
  const m = ICON.exec(title)
  if (!m) {
    skippedIcons++
    continue
  }
  // "(90px)" and "(100px)" are alternate renditions of one skin.
  const rest = m[1].replace(/\s*\(\d+px\)$/, "")
  const split = splitLegend(rest)
  if (!split) {
    skippedIcons++
    continue
  }
  if (!skins.has(split.legend)) skins.set(split.legend, new Map())
  const bucket = skins.get(split.legend)
  const key = fold(split.skin)
  // A skin can have both a static and an animated icon. First wins; the sweep
  // is alphabetical, so "AniSkinIcon" loses to "SkinIcon", which is the one
  // that thumbnails cleanly.
  if (!bucket.has(key)) bucket.set(key, { name: split.skin, icon: toFile(title) })
}

// ---- art: the profile backdrop ---------------------------------------------
// Art filenames are inconsistent in a way worth spelling out, because matching
// on any single rule loses half the catalogue:
//
//   "Ace Spiker Lin Fei.png"   <- skin then legend
//   "Aang.png"                 <- skin only; a collab name that says nothing
//   "Bodvar.png"               <- the legend alone, which is its Classic skin
//
// So three indexes are tried in order of how specific they are. Skin-only keys
// are only usable when the skin name occurs once in the whole catalogue —
// otherwise "Classic" would claim the first legend it happened to hit.
const bySkinAndLegend = new Map()
const bySkinAlone = new Map()
const ambiguousSkins = new Set()
const byLegendAlone = new Map()

for (const [legend, bucket] of skins) {
  for (const entry of bucket.values()) {
    bySkinAndLegend.set(fold(entry.name + legend), entry)
    const alone = fold(entry.name)
    if (bySkinAlone.has(alone)) ambiguousSkins.add(alone)
    else bySkinAlone.set(alone, entry)
    if (alone === "classic") byLegendAlone.set(fold(legend), entry)
  }
}

let matchedArt = 0
for (const title of arts) {
  const m = ART.exec(title)
  if (!m) continue
  // "AniApocalypse Mirage.gif" is the animated rendition of "Apocalypse".
  const key = fold(m[1].replace(/^Ani(?=[A-Z0-9])/, ""))
  const entry =
    bySkinAndLegend.get(key) ??
    (ambiguousSkins.has(key) ? undefined : bySkinAlone.get(key)) ??
    byLegendAlone.get(key)
  if (!entry || entry.art) continue
  entry.art = toFile(title)
  matchedArt++
}

const legends = {}
let total = 0
let withArt = 0
for (const [legend, bucket] of [...skins.entries()].sort()) {
  const list = [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name))
  legends[legend] = list
  total += list.length
  withArt += list.filter((s) => s.art).length
}

const payload = { generatedAt: new Date().toISOString().slice(0, 10), legends }
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(payload))

const bytes = fs.statSync(OUT).size
console.log(`icon files      ${icons.length}   (skipped ${skippedIcons})`)
console.log(`art files       ${arts.length}   (matched ${matchedArt})`)
console.log(`legends         ${Object.keys(legends).length} / ${roster.length}`)
console.log(`skins           ${total}   (${withArt} with full art)`)
console.log(`wrote ${OUT}  ${(bytes / 1024).toFixed(1)} KB`)
