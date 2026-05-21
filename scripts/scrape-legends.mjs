#!/usr/bin/env node
// Scrape legend portraits from https://www.brawlhalla.com/legends.
//
// Usage:
//   node scripts/scrape-legends.mjs [--out public/assets/legends] [--force]
//
// Flags:
//   --out <dir>   Output directory (default public/assets/legends)
//   --force       Re-download files that already exist locally
//   --dry         Parse the page and print what would be downloaded, no writes
//
// Writes a manifest at <out>/manifest.json keyed by slug:
//   { slug, name, source, file }
//
// Behavior:
//   - Throttles 250ms between downloads to be polite.
//   - Sets a descriptive User-Agent.
//   - Skips files that already exist unless --force.
//   - Per-image failures are reported but do not abort the run.

import { mkdir, writeFile, stat } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")

const INDEX_URL = "https://www.brawlhalla.com/legends"
const USER_AGENT =
  "brawlchemist-asset-scraper/0.1 (https://github.com/enricosaito/brawlchemist)"
const THROTTLE_MS = 250

function parseArgs(argv) {
  const args = { out: "public/assets/legends", force: false, dry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out") args.out = argv[++i]
    else if (a === "--force") args.force = true
    else if (a === "--dry") args.dry = true
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/scrape-legends.mjs [--out DIR] [--force] [--dry]",
      )
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(2)
    }
  }
  return args
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } })
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  }
  return await res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } })
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  }
  const buf = await res.arrayBuffer()
  return Buffer.from(buf)
}

// Pull each <a href="/legends/<slug>"> ... <img src alt> ... </a> block.
// The page's markup is consistent so a single regex over the HTML works.
function parseLegends(html) {
  const blockRe =
    /href="\/legends\/([a-z0-9][a-z0-9-]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/g
  const found = []
  const seen = new Set()
  let m
  while ((m = blockRe.exec(html))) {
    const slug = m[1]
    if (seen.has(slug)) continue
    seen.add(slug)
    found.push({ slug, source: m[2], name: decodeHtmlEntities(m[3]) })
  }
  return found
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = resolve(REPO_ROOT, args.out)

  console.log(`fetching index: ${INDEX_URL}`)
  const html = await fetchText(INDEX_URL)
  const legends = parseLegends(html)
  if (legends.length === 0) {
    console.error("no legends parsed — the page markup may have changed")
    process.exit(1)
  }
  console.log(`parsed ${legends.length} legends`)

  if (args.dry) {
    for (const l of legends) {
      console.log(`  ${l.slug.padEnd(20)} ${l.name.padEnd(22)} ${l.source}`)
    }
    return
  }

  await mkdir(outDir, { recursive: true })

  const manifest = []
  let downloaded = 0
  let skipped = 0
  let failed = 0

  for (const legend of legends) {
    const ext = (extname(new URL(legend.source).pathname) || ".png").toLowerCase()
    const fileName = `${legend.slug}${ext}`
    const filePath = join(outDir, fileName)
    const relPath = `/${args.out.replace(/^public\//, "")}/${fileName}`.replace(/\\/g, "/")

    if (!args.force && (await exists(filePath))) {
      skipped++
      manifest.push({ ...legend, file: relPath })
      continue
    }

    try {
      const buf = await fetchBinary(legend.source)
      await writeFile(filePath, buf)
      downloaded++
      manifest.push({ ...legend, file: relPath })
      console.log(
        `  ↓ ${legend.slug.padEnd(20)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB`,
      )
    } catch (err) {
      failed++
      console.warn(`  ! ${legend.slug.padEnd(20)} ${err.message}`)
    }
    await sleep(THROTTLE_MS)
  }

  const manifestPath = join(outDir, "manifest.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")

  console.log(
    `done. downloaded=${downloaded} skipped=${skipped} failed=${failed} total=${legends.length}`,
  )
  console.log(`manifest: ${manifestPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
