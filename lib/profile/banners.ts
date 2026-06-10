/**
 * Profile header banner presets.
 *
 * A "banner" here is the glassmorphed ambient wash behind the profile header
 * card — the copper→mystic gradient that ships as the default. Each preset is a
 * color variation of that same faded glass look, expressed as literal Tailwind
 * gradient classes so the scanner emits them (NEVER build these strings
 * dynamically — Tailwind only generates classes it can see as literals).
 *
 * Only a logged-in owner of a claimed profile can change their banner; everyone
 * sees the result. Storage is a single id on `user_customizations.banner_id`;
 * an unknown/legacy id resolves back to the default, so the surface never
 * breaks (cardinal constraint #3 — fail open).
 *
 * `wash` is the low-opacity gradient painted over the card. `swatch` is the
 * higher-contrast preview used in the picker (the wash is too faint to preview
 * on its own). When real banner art lands later, key the images by the same id
 * and read `wash` as the fallback.
 *
 * No server-only import: the client picker imports the labels + swatches.
 */

export interface BannerPreset {
  id: string
  label: string
  /** Ambient wash painted over the header card (low opacity). */
  wash: string
  /** Preview gradient shown in the picker (higher opacity to read at chip size). */
  swatch: string
}

export const DEFAULT_BANNER_ID = "copper"

/** The default ships first so it reads as "reset to default" in the picker. */
export const BANNER_PRESETS: BannerPreset[] = [
  {
    id: "copper",
    label: "Copper Dusk",
    wash: "bg-gradient-to-br from-copper/10 via-transparent to-mystic/10",
    swatch: "bg-gradient-to-br from-copper/70 to-mystic/60",
  },
  {
    id: "arcane",
    label: "Arcane",
    wash: "bg-gradient-to-br from-mystic/15 via-transparent to-violet-500/10",
    swatch: "bg-gradient-to-br from-mystic/70 to-violet-500/60",
  },
  {
    id: "ember",
    label: "Ember",
    wash: "bg-gradient-to-br from-rose-500/15 via-transparent to-amber-500/10",
    swatch: "bg-gradient-to-br from-rose-500/70 to-amber-500/60",
  },
  {
    id: "verdant",
    label: "Verdant",
    wash: "bg-gradient-to-br from-emerald-500/15 via-transparent to-teal-500/10",
    swatch: "bg-gradient-to-br from-emerald-500/70 to-teal-500/60",
  },
  {
    id: "tidal",
    label: "Tidal",
    wash: "bg-gradient-to-br from-sky-500/15 via-transparent to-blue-500/10",
    swatch: "bg-gradient-to-br from-sky-500/70 to-blue-500/60",
  },
  {
    id: "valhallan",
    label: "Valhallan",
    wash: "bg-gradient-to-br from-tier-gold/15 via-transparent to-amber-400/10",
    swatch: "bg-gradient-to-br from-tier-gold/70 to-amber-400/60",
  },
  {
    id: "bloom",
    label: "Bloom",
    wash: "bg-gradient-to-br from-pink-500/15 via-transparent to-rose-500/10",
    swatch: "bg-gradient-to-br from-pink-500/70 to-rose-500/60",
  },
  {
    id: "nebula",
    label: "Nebula",
    wash: "bg-gradient-to-br from-violet-500/15 via-transparent to-fuchsia-500/10",
    swatch: "bg-gradient-to-br from-violet-500/70 to-fuchsia-500/60",
  },
  {
    id: "vanguard",
    label: "Vanguard",
    wash: "bg-gradient-to-br from-red-500/15 via-transparent to-orange-500/10",
    swatch: "bg-gradient-to-br from-red-500/70 to-orange-500/60",
  },
  {
    id: "graphite",
    label: "Graphite",
    wash: "bg-gradient-to-br from-slate-400/10 via-transparent to-slate-600/15",
    swatch: "bg-gradient-to-br from-slate-400/70 to-slate-600/60",
  },
]

const BY_ID = new Map(BANNER_PRESETS.map((p) => [p.id, p]))

/** A valid, non-null preset for any input — unknown ids fall back to default. */
export function resolveBanner(id: string | null | undefined): BannerPreset {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_BANNER_ID)!
}

export function isValidBannerId(id: string): boolean {
  return BY_ID.has(id)
}
