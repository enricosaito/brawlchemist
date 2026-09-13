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
  "website",
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
  website: { label: "Website", placeholder: "https://your.site" },
}
