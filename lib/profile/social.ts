/**
 * Social link kinds an owner can set on their profile.
 *
 * Lives here rather than in lib/sync/customizations.ts because the customizer
 * is a client component and that module is `server-only` — the allow-list and
 * its labels are needed on both sides of the boundary, the validation is not.
 * customizations.ts re-exports these so existing import paths keep working.
 *
 * No `server-only` import, deliberately (same reason as lib/profile/banners.ts).
 */

export const SOCIAL_KINDS = [
  "twitter",
  "twitch",
  "youtube",
  "discord",
  "steam",
] as const
export type SocialKind = (typeof SOCIAL_KINDS)[number]

export interface SocialLink {
  kind: SocialKind
  url: string
}

/** Display label + input placeholder per social kind (shared by form + render). */
export const SOCIAL_META: Record<
  SocialKind,
  { label: string; placeholder: string }
> = {
  twitter: { label: "X (Twitter)", placeholder: "https://x.com/you" },
  twitch: { label: "Twitch", placeholder: "https://twitch.tv/you" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@you" },
  discord: { label: "Discord", placeholder: "https://discord.gg/invite" },
  steam: { label: "Steam", placeholder: "https://steamcommunity.com/id/you" },
}

/**
 * The hosts each kind is allowed to point at.
 *
 * There used to be a sixth kind, `website`, which accepted any https URL —
 * and one profile was using it to link a porn site from a page with our name
 * on it. The kind is gone, but removing it alone would have fixed nothing:
 * nothing checked the *host* either, so the same URL filed under "twitch"
 * would have rendered the Twitch glyph and linked straight to it. A profile
 * link is a claim about an account somewhere, and the only version of that we
 * can stand behind is one where the glyph and the destination agree.
 *
 * Matching is exact-host or true subdomain, never `includes`: `endsWith(".x.com")`
 * rejects `evil-x.com` and `x.com.evil.net`, which a substring test would both
 * wave through.
 */
export const SOCIAL_HOSTS: Record<SocialKind, readonly string[]> = {
  twitter: ["x.com", "twitter.com"],
  twitch: ["twitch.tv"],
  youtube: ["youtube.com", "youtu.be"],
  discord: ["discord.gg", "discord.com"],
  steam: ["steamcommunity.com"],
}

export function isSocialKind(value: unknown): value is SocialKind {
  return (
    typeof value === "string" &&
    (SOCIAL_KINDS as readonly string[]).includes(value)
  )
}

/**
 * Is this URL an https link to the site this kind names?
 *
 * Shared by the panel (so a rejected URL is told to you) and the write path (so
 * it is true regardless of what the panel did). The write path is the one that
 * decides; the panel is only spelling out the rule early.
 */
export function isAllowedSocialUrl(kind: SocialKind, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  const host = parsed.hostname.toLowerCase()
  return SOCIAL_HOSTS[kind].some((h) => host === h || host.endsWith(`.${h}`))
}
