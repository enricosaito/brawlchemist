import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * players — one row per Brawlhalla player we've ever enriched.
 *
 * Data here comes from `/player/{id}/ranked` (current ranked-season stats).
 * `ranked_json` keeps the full payload as jsonb because the API occasionally
 * renames fields and we'd rather keep older snapshots parseable than blow up
 * on schema drift. `top_legend_id` is the player's most-played legend in this
 * ranked season — pre-computed so the leaderboard join stays cheap.
 *
 * Lifetime stats (from /player/{id}/stats) will land in a sibling column /
 * table once player profile pages need them.
 */
export const players = pgTable(
  "players",
  {
    brawlhallaId: integer("brawlhalla_id").primaryKey(),
    username: text("username").notNull(),
    /** Single legend with the most games played in the current ranked season. */
    topLegendId: integer("top_legend_id"),
    rankedJson: jsonb("ranked_json"),
    /**
     * Season 1v1 rating, lifted out of ranked_json by upsertPlayerRanked.
     *
     * Exists so ordering never has to touch the blob: sorting on a ranked_json
     * expression detoasts the whole ~200MB column and measured 95s on the
     * username search. A `ladder_rating` column was meant to serve this role and
     * never did — only an unreferenced harvest wrote it, so it was null for all
     * 97,325 rows and left search results in physical order. It is gone.
     */
    rating: integer("rating"),
    /**
     * Account level and lifetime seconds in matches, from GetPlayerStats.
     *
     * The only two facts on this row that /ranked does not carry, and the two the
     * "possible smurf" reading needs (see lib/profile/smurf.ts). They live here
     * rather than in a table of their own because the question is asked per row
     * across a whole leaderboard, and a second table would mean a join or a
     * second read on every list view.
     *
     * Written wherever a fresh /stats payload already exists — a profile view, or
     * the backfill script — never by a call made for this. Null means nobody has
     * looked yet, which is why the predicate treats unknown as "no" rather than
     * as zero. `statsSynced` is how the backfill knows what it can skip.
     */
    level: integer("level"),
    playtimeSeconds: integer("playtime_seconds"),
    statsSynced: timestamp("stats_synced", { withTimezone: true }),
    /** The player's guild, discovered via GetPlayerGuild. `guildId` is null when
     * they have no guild; `guildCheckedAt` records the last lookup so the guild
     * discovery cron can skip recently-checked players. */
    guildId: integer("guild_id"),
    guildName: text("guild_name"),
    guildCheckedAt: timestamp("guild_checked_at", { withTimezone: true }),
    lastSynced: timestamp("last_synced", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // DECLARED HERE ON PURPOSE. These are performance indexes, not schema
    // decoration, and drizzle-kit push reconciles the database down to this
    // file — anything it cannot see here, it DROPS. Created out-of-band once
    // and silently removed by the next push, which took the username search
    // from ~400ms back to the 95s it used to be.
    //
    // Trigram GIN: /api/search/players and /search match usernames with
    // ILIKE %q% across ~90k rows, which no btree can serve. Requires the
    // pg_trgm extension (see db/perf-indexes.sql).
    index("players_username_trgm_idx").using(
      "gin",
      sql`${t.username} gin_trgm_ops`
    ),
    // Search orders by this; see the column comment.
    index("players_rating_idx").on(t.rating.desc().nullsLast()),
    // "Best players who main this legend", for Suggested Favorites.
    //
    // Measured without it: a sequential scan of the whole table, 25k buffers
    // and 3.3s, for three rows — cardinal constraint #6 exactly. The leading
    // column narrows to the legend and the trailing one is already in rating
    // order, so the query reads three index entries and stops. `players_rating_idx`
    // cannot serve it: filtering on top_legend_id while ordering by rating
    // means walking the whole rating index for a rare main.
    index("players_top_legend_rating_idx").on(
      t.topLegendId,
      t.rating.desc().nullsLast()
    ),
  ]
)

/**
 * A players row as the app reads it.
 *
 * `region` is NOT a column — it is extracted from `ranked_json` and only
 * projected when a caller opts in with `withRegion`, because reading it
 * detoasts the blob per row. It lives on this type rather than in each
 * caller's own shape so the one place that knows how to derive it
 * (PLAYER_SCALAR_COLUMNS) stays the only place that does.
 *
 * There were two real columns for this once, `ladder_rating` and
 * `ladder_region`, written by a harvest that nothing ever called. They held 0
 * non-null values across 97,325 rows and cost this project three separate bugs
 * — a missing region pill on /favorites, a missing one on the admin People
 * list, and a guild-discovery cron whose "order by rating" ranked nothing at
 * all because every value it sorted on was null.
 */
export type PlayerRow = typeof players.$inferSelect & {
  region?: string | null
}
export type PlayerInsert = typeof players.$inferInsert

/**
 * profiles — per-player presentation data keyed by brawlhalla id: verified-pro
 * status (+ display handle), favorite skin, and esports accolades. Today these
 * are admin-curated (no API source) through the /admin page; `userId` reserves
 * the link to a future auth owner so a player can eventually claim their own
 * profile. Read everywhere a `PlayerPreview` is consumed.
 */
export const profiles = pgTable("profiles", {
  /** The Brawlhalla player this profile describes. Natural identity, and every
   * consumer joins on it, so it stays the primary key. */
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  /**
   * LEGACY — superseded by `proTier`, and still declared (and still written)
   * only so the previously running build can keep selecting it. Droppable on
   * the deploy after this one, the same two-step `esportsBrawlhallaId` is in.
   *
   * It could say "we vouch for this person" and nothing more, so a regional
   * regular and a world champion rendered the same badge. Reads go through
   * `resolveProTier`, which treats a legacy `true` as Pro Player — the claim it
   * was already making — so the migration promotes and demotes nobody.
   */
  isPro: boolean("is_pro").notNull().default(false),
  /**
   * How established a competitor is: 'top' | 'pro' | 'power-ranked' | 'none'.
   *
   * A closed allow-list read through `parseProTier` (lib/profile/pro-tier.ts),
   * so an id we no longer ship degrades to no badge rather than to a claim
   * nobody can account for. Nullable with no default, which is what keeps
   * adding it metadata-only, and null means "read the legacy boolean".
   */
  proTier: text("pro_tier"),
  /** Optional handle shown next to the badge (e.g. "Kyna"). */
  handle: text("handle"),
  /** Favorite skin shape: { src, name } | null. */
  favoriteSkin: jsonb("favorite_skin"),
  /**
   * DEAD — replaced by `cmPlayerId`, and still declared only so the previously
   * running build can keep selecting it. Droppable on the deploy after this
   * one, the same two-step `profiles.achievements` took.
   *
   * It stored the Brawlhalla account a pro competes on, which turned out to be
   * the wrong key: the bridge only ever wanted a Challengermode id and used
   * this to look one up. brawltools holds a `cmPlayerId` for almost every
   * competitor but a `brawlhallaId` for very few — measured across the 38 pros
   * with no match history, only 6 had one — so keying on the Brawlhalla id made
   * the majority unlinkable for no reason. It never held a value.
   */
  esportsBrawlhallaId: integer("esports_brawlhalla_id"),
  /**
   * This pro's Challengermode identity, when we cannot derive it.
   *
   * The bridge in scripts/sync-esports-matches.mjs maps `cmPlayerId ->
   * brawlhalla_id`, and normally gets the CM id by asking brawltools about the
   * account this profile already names. That fails for 38 of 122 verified pros:
   * some compete on a second account (Ahmet — profile 45653969, in-game
   * "HaciTCH"), and most simply have no `brawlhallaId` on their brawltools
   * record at all. Either way the profile shows no matches, silently.
   *
   * Curated, never derived. Two independent sources agreeing on a name is
   * strong evidence and still not proof — Brawlhalla names are not unique, and
   * a wrong link puts someone else's career on a pro's profile. So /admin
   * gathers the evidence and grades it, and an operator asserts the link.
   *
   * Match rows are always written under the profile's canonical
   * `brawlhalla_id`, so this never leaks past the sync script.
   */
  cmPlayerId: text("cm_player_id"),
  /**
   * Esports titles as a string[] (jsonb), e.g. ["2v2 World Champion '24"].
   *
   * The column keeps its original name while the property does not, on purpose.
   * These used to be called achievements, which stopped being usable the moment
   * the profile grew an actual achievement system — but `drizzle-kit push` has
   * no rename: it would see one column dropped and another added, and take the
   * data with it. Mapping the name here is free and reversible; renaming the
   * column is an ALTER that has to be sequenced against a deploy, and it buys
   * nothing the mapping doesn't.
   */
  /** Auth owner — the Supabase `auth.users` id of whoever claimed this player
   * via the ELO challenge (or an admin/CM assignment). Null = unclaimed (the
   * original admin-curated state). Unique so one auth user owns at most one
   * profile. No FK (auth.users lives in a different schema and we connect with a
   * service role); the link is enforced in app code. */
  userId: uuid("user_id").unique(),
  /** When this player was first claimed by `userId` (null = unclaimed). */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  /** How ownership was established: 'quiz' (ELO challenge) | 'cm' | 'admin'. */
  claimMethod: text("claim_method"),
  /** When ownership reached verified trust (today: same instant as claimedAt for
   * the quiz path; reserved so a stronger tier can diverge later). */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type ProfileRow = typeof profiles.$inferSelect
export type ProfileInsert = typeof profiles.$inferInsert

/**
 * profile_claims — the "prove it's you" verification ledger for player claims.
 *
 * A logged-in user proves ownership of a Brawlhalla ID by answering the exact
 * season ranked rating of one of their *mid-to-least-played* legends — a value
 * that lives in our stored `players.ranked_json` but is never rendered on the
 * public page, so it's known to the account owner but not to onlookers. The
 * challenge is generated and graded entirely from our own DB, so claims add
 * ZERO Brawlhalla API calls.
 *
 * One row per (userId, brawlhallaId): `challenge` holds the server-only answer,
 * `attempts` counts wrong tries inside a rolling 24h window (createdAt = window
 * start), and a partial-unique index guarantees a single verified owner per
 * player. Ownership itself lives on `profiles.userId`; this table is the
 * in-flight state + audit trail.
 */
export const profileClaims = pgTable(
  "profile_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Claimant — a Supabase `auth.users` id. */
    userId: uuid("user_id").notNull(),
    brawlhallaId: integer("brawlhalla_id").notNull(),
    /** 'pending' | 'verified' | 'revoked'. */
    status: text("status").notNull().default("pending"),
    /** 'quiz' | 'cm' | 'admin'. */
    method: text("method").notNull().default("quiz"),
    /** SERVER-ONLY — never sent to the client: { legendId, legendName,
     * correctRating }. Only the legend name leaves the server (the question). */
    challenge: jsonb("challenge"),
    /** Wrong answers inside the current 24h window. */
    attempts: integer("attempts").notNull().default(0),
    /** When the current challenge stops accepting answers (regenerate to renew). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("profile_claims_user_player_idx").on(t.userId, t.brawlhallaId),
    index("profile_claims_player_status_idx").on(t.brawlhallaId, t.status),
    uniqueIndex("profile_claims_one_verified_idx")
      .on(t.brawlhallaId)
      .where(sql`${t.status} = 'verified'`),
  ]
)

export type ProfileClaimRow = typeof profileClaims.$inferSelect
export type ProfileClaimInsert = typeof profileClaims.$inferInsert

/**
 * app_users — our application row mirroring a Supabase `auth.users` identity,
 * created on first sign-in. Holds per-account preferences (favorite legends,
 * default region/mode, UI settings) and the plan flag for future premium gating.
 * Exists independently of any profile claim — a signed-in user may never claim a
 * player and still have prefs here. `id` equals the auth user id (no FK: auth
 * lives in another schema and we connect with a service role).
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey(),
  /** Mirror of the auth email, for admin lookups (auth.users isn't joinable here). */
  email: text("email"),
  /**
   * Subscription: 'free' | 'supporter' | 'founder'. See lib/auth/account.ts.
   *
   * Predates the role column and shipped with 'premium' as its other value,
   * which nothing ever read or wrote; `parsePlan` reads anything unrecognised
   * as free, so those rows need no backfill and can never be mistaken for a
   * paid entitlement.
   */
  plan: text("plan").notNull().default("free"),
  /**
   * Permission: 'developer' | 'partner' | 'user'. See lib/auth/account.ts.
   *
   * Separate from `plan` because permission and subscription are different
   * questions that move independently — a Partner can also be a Founder, and a
   * lapsed card must never be able to take away someone's admin access.
   *
   * Text with a code-side allow-list rather than a Postgres enum, like every
   * other categorical column here (plan, profile_claims.status, banner_id,
   * flair_id): schema changes ship through `drizzle-kit push` straight to prod
   * with no migration files, and altering an enum type is the one thing push
   * handles worst. Reads go through `parseRole`, so an unrecognised value
   * degrades to a regular user rather than to undefined permissions.
   *
   * "Linked User" is deliberately NOT a value here — it is derived from
   * `profiles.userId`, which is the actual link. See resolveRole.
   */
  accountRole: text("account_role").notNull().default("user"),
  /** Viewer prefs: { favoriteLegendIds, defaultRegion, defaultMode, ... }. */
  prefs: jsonb("prefs"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type AppUserRow = typeof appUsers.$inferSelect
export type AppUserInsert = typeof appUsers.$inferInsert

/**
 * user_customizations — the public-facing customization a verified owner sets on
 * their claimed profile, keyed 1:1 by brawlhalla id. Kept separate from
 * `profiles` so admin pro-curation (isPro, esports titles, favoriteSkin) and
 * user-set fields never overwrite each other. Ownership is enforced in app code
 * via `profiles.userId` — only the owner can write this row. Read fails open on
 * the public profile (no customization → plain rendering).
 */
export const userCustomizations = pgTable("user_customizations", {
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  /** Allow-listed social links: [{ kind, url }] (https only). */
  socialLinks: jsonb("social_links"),
  /** Up to a few legend ids the owner wants to highlight. */
  favoriteLegendIds: jsonb("favorite_legend_ids"),
  /** Chosen header banner preset id (see lib/profile/banners.ts). Null = the
   * default copper→mystic wash. Validated against the preset allow-list on
   * read/write — an unknown id falls back to the default, never a broken
   * surface. */
  bannerId: text("banner_id"),
  /** Chosen flair id (see lib/profile/flair.ts), or the literal "none" to fly
   * nothing. Null means never chosen, which renders the best flair the player
   * has earned — a selection is a preference, not the entitlement, and the
   * entitlement is always derived. Unknown ids fall back the same way. */
  flairId: text("flair_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type UserCustomizationRow = typeof userCustomizations.$inferSelect
export type UserCustomizationInsert = typeof userCustomizations.$inferInsert

/**
 * flairs — the badge catalogue, curated from /admin.
 *
 * Only the *catalogue* lives here: what a flair is called, what it looks like,
 * and which of a small set of code-backed rules decides who holds it. The rules
 * themselves cannot be data — `rule` is an allow-list read through `parseRule`,
 * because "who has earned this" is a question only code can answer against the
 * player record. What an operator can change without a deploy is the art, the
 * wording, the rarity order, and which rule a badge uses.
 *
 * A *selection* (user_customizations.flair_id) still stores only a preference:
 * entitlement is re-derived on every render, so a row here appearing or
 * vanishing can add or remove a badge but can never strand a bad one.
 *
 * Tiny by construction — a handful of rows of short text — and read once per
 * request behind a cache tag, so it costs nothing against the egress budget.
 */
export const flairs = pgTable("flairs", {
  /** Slug, and the value stored as a selection. Stable: renaming breaks choices. */
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  /** How to earn it, shown on the locked row in the picker. */
  requirement: text("requirement").notNull().default(""),
  /** Public URL — a Vercel Blob upload, or a path under /public for built-ins. */
  src: text("src").notNull(),
  /** Intrinsic pixels, parsed out of the PNG on upload so next/image can size it. */
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /**
   * Which code rule decides entitlement: 'manual' | 'developer' | 'achievement'.
   *
   * Text with a code-side allow-list rather than a Postgres enum, for the same
   * reason as account_role: schema ships through `drizzle-kit push` with no
   * migration files, and altering an enum type is what push handles worst.
   */
  rule: text("rule").notNull().default("manual"),
  /** Case-insensitive substring matched against the esports titles, for rule='achievement'. */
  ruleValue: text("rule_value"),
  /**
   * Rarity rank, ascending. The lowest-numbered flair a player holds is the one
   * they fly when they haven't chosen — catalogue order IS the ranking, which
   * is why an operator can set it.
   */
  sort: integer("sort").notNull().default(100),
  /** Off keeps the row (and everyone's selection of it) while hiding the badge. */
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type FlairRow = typeof flairs.$inferSelect
export type FlairInsert = typeof flairs.$inferInsert

/**
 * true_combos — The Lab's clip library.
 *
 * The *metadata* lives here; the video never does. Clips are Vercel Blob URLs,
 * which matters more than it sounds: Supabase storage egress bills against the
 * same 5GB/month as every query on the site, and that budget has been blown
 * three times already (cardinal constraint #2). Video is the largest thing this
 * site could ever serve, so it is served from the platform that is on a paid
 * plan, and Postgres holds a couple of hundred bytes of text pointing at it.
 *
 * A table rather than a code module because the alternative is a deploy per
 * clip. `lib/true-combos.ts` shipped as a static list and was right for five
 * entries; at two hundred it makes adding a video a pull request. Same split as
 * `flairs`: the catalogue is data an operator curates, and the only thing code
 * owns is which weapon ids are real.
 *
 * Tiny by construction — no jsonb, a few hundred rows of short strings — and
 * read once per request behind a cache tag, so it costs nothing against either
 * the egress or the 500MB size budget.
 */
export const trueCombos = pgTable(
  "true_combos",
  {
    /** Slug, stable: it is the anchor a clip can be linked by. */
    id: text("id").primaryKey(),
    /** A `WeaponId` — validated in code, since the roster is code. */
    weaponId: text("weapon_id").notNull(),
    /** Input notation, e.g. "dLight → nAir". */
    notation: text("notation").notNull(),
    /** When it works: the damage window, the gravity, the stage position. */
    note: text("note"),
    /** Blob URL of the clip itself. */
    src: text("src").notNull(),
    /** Blob URL of a poster frame. Null renders the play button on black. */
    poster: text("poster"),
    /** Ascending within a weapon. Operator-owned, so the basics can come first. */
    sort: integer("sort").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Declared here and nowhere else: `drizzle-kit push` reconciles the database
  // down to this file and drops any index it cannot see (it silently removed
  // all four perf indexes once). The read is always "one weapon, in order".
  (t) => [index("true_combos_weapon_sort_idx").on(t.weaponId, t.sort)]
)

export type TrueComboRow = typeof trueCombos.$inferSelect
export type TrueComboInsert = typeof trueCombos.$inferInsert

/**
 * esports_titles — championship wins, derived rather than typed.
 *
 * `profiles.esports_titles` is a curated array an operator maintains by hand.
 * This table is the machine-readable half: one row per (tournament, player)
 * where the player's lineup finished first in an official championship, built
 * by scripts/sync-esports-titles.mjs from Challengermode placements.
 *
 * The two coexist and are merged on read. Curation stays because the API only
 * covers what Challengermode hosted — the SGG era before 2022 is not in there,
 * and a title someone earned at an event nobody indexed still belongs on their
 * profile. Derived rows never overwrite a curated one; they are deduped by the
 * exact title string.
 *
 * `tournamentId` and `tournamentName` are kept for provenance, not display:
 * the point of deriving a title is being able to say which event produced it,
 * and a row nobody can trace back is a guess with a timestamp.
 */
export const esportsTitles = pgTable(
  "esports_titles",
  {
    /**
     * `${tournamentId}:${brawlhallaId}` for a derivation,
     * `manual:${brawlhallaId}:${md5(title)}` for a hand-typed one. Either way
     * it is a function of its inputs, so writing the same title twice is
     * idempotent rather than a duplicate tag on a profile.
     */
    id: text("id").primaryKey(),
    brawlhallaId: integer("brawlhalla_id").notNull(),
    /** Rendered form, e.g. "1v1 Summer Champion '26". */
    title: text("title").notNull(),
    /**
     * "derived" — read off a Challengermode placement by
     * scripts/sync-esports-titles.mjs. "manual" — someone typed it in /admin.
     *
     * Both are titles and the profile renders them identically; they differ in
     * who is making the claim. The distinction exists so an operator can tell
     * which ones the script will recreate if it runs again, and because the two
     * are complementary rather than alternative: the script structurally cannot
     * reach the pre-Challengermode history, so BCX '21 and the SGG-era worlds
     * can only ever be typed.
     */
    source: text("source").notNull().default("derived"),
    /**
     * Everything below describes a *derivation* and is therefore null for a
     * manual title. A hand-typed honour names no tournament.
     */
    year: integer("year"),
    /** "1v1" | "2v2" — the game mode the event was run in. */
    mode: text("mode"),
    /** The Challengermode tournament this was read from. */
    tournamentId: text("tournament_id"),
    tournamentName: text("tournament_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Declared here and nowhere else: `drizzle-kit push` reconciles the database
  // down to this file and drops any index it cannot see. The read is always
  // "every title, grouped by player", so the id column is what it walks.
  (t) => [index("esports_titles_player_idx").on(t.brawlhallaId)]
)

export type EsportsTitleRow = typeof esportsTitles.$inferSelect

/**
 * esports_matches — a pro's tournament results, match by match.
 *
 * The companion to esports_titles: that table says a player won an event, this
 * one says how they got there and who they had to beat. Both are derived from
 * Challengermode and neither can be typed by hand, because a bracket is not
 * something an operator can reconstruct from memory.
 *
 * **One row per (match, tracked player)**, not per match — the same shape
 * esports_titles uses, and for the same reason: every read is "this player's
 * matches", so `brawlhalla_id` is the column it walks and one indexed scan
 * answers it. A match between two tracked pros therefore stores two rows, one
 * from each side. That duplication is the point: each row is already the answer
 * to the question the profile asks, so nothing has to be joined or flipped at
 * render time.
 *
 * Reaching this data at all is the interesting part, and it is written down
 * because nothing about it is guessable:
 *
 *   brawltools has NO match endpoint — placements only (measured: /v2/match,
 *   /v2/player/{id}/matches and friends all 404). Challengermode has the full
 *   bracket, but `Tournament.stages` is an INTERFACE, so a plain selection
 *   returns index/format/lineupCount and looks empty. The matches are behind
 *   `... on TournamentEliminationStage { brackets { rounds { matchSeriesPage`.
 *   Only CM-hosted events have brackets: 77 of 240 official events, and they
 *   are all 2025-2026. Measured — 2021 through 2024 are 100% SGG-hosted (221
 *   events, no brackets at all), 2025 is 36 CM against 14 SGG, and 2026 is
 *   wholly CM. So match history begins in 2025, not the ~2022 first assumed.
 *
 * The join is proved, never matched on a name: Challengermode gives a member's
 * `user.id` and brawltools stores that same UUID as `cmPlayerId` (verified —
 * megD, brawlhalla 33116656, is 6c92f7c2-e989-404e-a83b-5ed975302322 on both
 * sides). A participant we cannot confirm is stored as a display name with a
 * null id rather than guessed at.
 *
 * Costs no Brawlhalla API budget at all (cardinal constraint #1): every byte
 * here comes from Challengermode and brawltools.
 */
export const esportsMatches = pgTable(
  "esports_matches",
  {
    /** `${matchSeriesId}:${brawlhallaId}` — a function of its inputs, so a
     * re-run updates in place rather than duplicating a result. */
    id: text("id").primaryKey(),
    /** The Challengermode match series. Shared by the two rows of one match,
     * which is what makes a head-to-head answerable later. */
    matchId: text("match_id").notNull(),
    /** The tracked player this row is about. Every read starts here. */
    brawlhallaId: integer("brawlhalla_id").notNull(),

    tournamentId: text("tournament_id").notNull(),
    tournamentName: text("tournament_name"),
    year: integer("year"),
    /** "1v1" | "2v2" — the event's mode, not the match's. */
    mode: text("mode"),

    /** "Upper" | "Lower" | "Finals" | a group's title. */
    bracket: text("bracket"),
    /** The round as Challengermode titles it, e.g. "Upper Semi finals". */
    roundTitle: text("round_title"),
    roundNumber: integer("round_number"),
    bestOf: integer("best_of"),
    startedAt: timestamp("started_at", { withTimezone: true }),

    /**
     * Did this player's side win.
     *
     * Nullable on purpose: a bye, a draw and a match whose result never became
     * final are all "not a loss", and storing false for them would invent a
     * defeat that never happened. The profile renders those as neither.
     */
    won: boolean("won"),
    scoreFor: integer("score_for"),
    scoreAgainst: integer("score_against"),

    /** Display form of the other side — a handle in 1v1, a lineup in 2v2. */
    opponentName: text("opponent_name"),
    /**
     * Whichever opponents resolved to a Brawlhalla account, so the row can link
     * to a profile. An `integer[]` and not jsonb: it is one or two ints and
     * constraint #2 is about blobs, not arrays. Empty when nobody resolved,
     * which is normal — most bracket entrants are not tracked competitors.
     */
    opponentIds: integer("opponent_ids").array(),
    /** The partner in 2v2, display form. Null in 1v1. */
    teammateName: text("teammate_name"),

    /**
     * Legends this player picked, in game order, as roster slugs.
     *
     * Challengermode records them as per-game statistics named Game1_Legend
     * through Game5_Legend, with "NA" for a game that never happened. All 64
     * values it uses map cleanly onto LEGEND_ROSTER once punctuation and case
     * are dropped ("Bodvar" and "LinFei" being the two that look like they
     * would not), so these are stored as slugs and render as LegendChips.
     *
     * The sequence is kept rather than a set: playing LinFei four times and
     * switching to Diana for the decider are different stories, and collapsing
     * to distinct is a display decision the renderer can make. Empty when
     * nobody reported, which is most matches outside the deep rounds.
     */
    legends: text("legends").array(),
    /** The same for the other side, so a row can say who beat whom with what. */
    opponentLegends: text("opponent_legends").array(),
    /**
     * How many games the series actually went.
     *
     * The number `bestOf` should have told us and does not: Challengermode
     * reports **every** match in these events as `bestOf: 1`, including a
     * championship final that ran five slots and used four. Derived by counting
     * the legend slots that are not "NA", taking the higher of the two sides —
     * one player reporting and the other not is common, and a series is as long
     * as the longer report.
     *
     * Deliberately NOT turned into a score. The winner takes ceil(bestOf/2), so
     * games-played would give "3–1" if the format were known — but finals are
     * Bo5 and early rounds Bo3 by a per-event convention the API never states,
     * and a three-game series is 2–1 or 3–0 depending which. There are no
     * per-game result nodes to settle it: Challengermode models the whole set as
     * one Match and the games exist only in these statistics. So this stores a
     * fact and leaves the inference alone.
     */
    gamesPlayed: integer("games_played"),
    /** Wall-clock length of the set, from the game session. */
    durationSeconds: integer("duration_seconds"),

    /**
     * The partner's Brawlhalla ids, so a 2v2 row can link to them.
     *
     * The sibling of opponentIds and empty for the same reason: most entrants
     * are not tracked competitors. Null in 1v1, where there is no partner.
     */
    teammateIds: integer("teammate_ids").array(),

    /**
     * Where this player finished in the tournament.
     *
     * A fact about the *run*, denormalised onto every row of it, because the
     * alternative is a second table holding one number per (tournament, player)
     * and a join on a page that is otherwise one indexed scan. Challengermode
     * gives it on the roster, and gives it completely: 315 of 315 lineups
     * carried one on the event this was built against.
     *
     * Two columns, because a bracket does not produce a single number.
     * placementRank is bestPlacement — 1, 2, 3, 4, 5, 7, 9, 13 and so on, which
     * is what an ordinal is rendered from. placementDisplay keeps
     * Challengermode's own string ("5 - 6", "9 - 12"), because finishing
     * joint-fifth is not the same claim as finishing fifth and the tooltip
     * should be able to say which it was.
     */
    placementRank: integer("placement_rank"),
    placementDisplay: text("placement_display"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Declared here and nowhere else: `drizzle-kit push` reconciles the database
  // down to this file and drops any index it cannot see. The profile read is
  // "this player's matches, newest first", so the index carries the sort too —
  // and NULLS LAST to match the query, because an index whose null ordering
  // disagrees with the ORDER BY does not get used (see cardinal constraint #8).
  (t) => [
    index("esports_matches_player_idx").on(
      t.brawlhallaId,
      t.startedAt.desc().nullsLast()
    ),
    index("esports_matches_match_idx").on(t.matchId),
  ]
)

export type EsportsMatchRow = typeof esportsMatches.$inferSelect

/**
 * flair_grants — who holds a `rule='manual'` flair.
 *
 * The other two rules read facts we already have (an account's role, a curated
 * accolade). A badge invented in the admin panel has no such fact behind it, so
 * something has to record the award — otherwise "create a flair" produces a row
 * nobody can ever earn.
 *
 * Keyed by brawlhalla_id like every other presentation table, and read as one
 * cached map rather than a lookup per row (the shape that has blown the egress
 * budget before).
 */
export const flairGrants = pgTable(
  "flair_grants",
  {
    brawlhallaId: integer("brawlhalla_id").notNull(),
    flairId: text("flair_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.brawlhallaId, t.flairId] })]
)

export type FlairGrantRow = typeof flairGrants.$inferSelect

/**
 * guilds — one row per guild we've discovered (via the player pool / profile
 * views). The Brawlhalla API has no "list guilds" endpoint, so this table *is*
 * our guild leaderboard: rows are ordered by the API's official `rank`.
 *
 * `stats_json` keeps the full GetGuildStats payload as jsonb (drift-safe, like
 * players.ranked_json). We don't store member rosters — the detail page reads
 * live stats only. xp values use bigint — a large guild's lifetime XP can
 * exceed the int4 ceiling.
 */
export const guilds = pgTable(
  "guilds",
  {
    guildId: integer("guild_id").primaryKey(),
    name: text("name").notNull(),
    /** Official global guild rank (lower is better). Null when unranked. */
    rank: integer("rank"),
    xp: bigint("xp", { mode: "number" }),
    legacyXp: bigint("legacy_xp", { mode: "number" }),
    /** Weekly guild points (resets weekly). */
    guildPoints: bigint("guild_points", { mode: "number" }),
    memberCount: integer("member_count"),
    /** Guild creation date — UNIX seconds. */
    createDate: integer("create_date"),
    /** Tags as a string[] (jsonb). */
    tags: jsonb("tags"),
    isRecruiting: boolean("is_recruiting"),
    notice: text("notice"),
    discordInviteCode: text("discord_invite_code"),
    /** Full GetGuildStats payload. */
    statsJson: jsonb("stats_json"),
    lastSynced: timestamp("last_synced", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Matches getGuildLeaderboard ORDER BY exactly. Without it /guilds sorted
  // 18.5k rows unaided and once failed the production build outright.
  (t) => [index("guilds_rank_xp_idx").on(t.rank.asc().nullsLast(), t.xp.desc())]
)

export type GuildRow = typeof guilds.$inferSelect
export type GuildInsert = typeof guilds.$inferInsert

/**
 * Guild leaderboard list shape: every column except the heavy `stats_json`
 * blob, which the list view never renders (the guild detail page loads it
 * separately via getGuildById). Keeping it out of the leaderboard read
 * collapses the per-row payload — that query runs for up to 200 guilds and
 * re-runs on every cache refresh, so the blob was a large chunk of our egress.
 */
export type GuildListRow = Omit<GuildRow, "statsJson">

/**
 * cron_controls — admin pause switches for the scheduled sync jobs. Each cron
 * route checks its key here before doing any API work, so a single toggle in
 * /admin can stop a job that's eating the Brawlhalla API rate limit (which is
 * shared with on-demand profile fetches). A missing row means "not paused", so
 * the table only holds keys that have ever been toggled.
 */
export const cronControls = pgTable("cron_controls", {
  /** Matches the route segment under app/api/cron/<key>. */
  key: text("key").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  /**
   * Free-form JSON scratch for a job that has to resume where it stopped.
   *
   * Only harvest-search uses it today, to remember which (mode, region, page)
   * the ladder walk reached — a sweep of every Platinum ladder is ~3,500 pages
   * and cannot run in one invocation, so the progress has to outlive the
   * request. It lives here rather than in its own table because it is one
   * short string per job, and a table for that is a join nobody wanted.
   */
  cursor: text("cursor"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type CronControlRow = typeof cronControls.$inferSelect

/**
 * fetch_log — diagnostic record of every /ranked call our profile surface
 * considers (page render, OG image, admin save). Captures the request's
 * user-agent and referer so /admin can see who is hitting which profiles and
 * why rows appear in the pool. Pruned manually via the "Clear log" button.
 */
export const fetchLog = pgTable(
  "fetch_log",
  {
    id: serial("id").primaryKey(),
    brawlhallaId: integer("brawlhalla_id").notNull(),
    /** Where the fetch happened: "page-view" | "og-image" | "admin-save". */
    source: text("source").notNull(),
    /** Outcome: "cached" (read-through hit, no API), "synced" (API ok, upserted),
     *  "failed" (API errored — `apiStatus` carries the HTTP status). */
    result: text("result").notNull(),
    apiStatus: integer("api_status"),
    /**
     * Short client label from clientLabel() — "bingbot", "googlebot", "human", …
     *
     * Replaced storing the raw User-Agent, which at ~125 bytes was 79% of every
     * row and drove this table to 362 MB (59% of the 500 MB quota) for data only
     * ever read as "which crawler is this".
     *
     * The `user_agent` column is gone. It stopped being written on 2026-09-11,
     * but the rows already holding one kept ~47 MB alive until the retention
     * window rolled over — a dead column is only free once the table is
     * rewritten, so it was dropped and the table VACUUM FULL'd rather than left
     * to age out (see db/reclaim-space.sql).
     */
    client: text("client"),
    referer: text("referer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Serves the rolling retention prune in the sync-valhallan cron.
  (t) => [index("fetch_log_created_at_idx").on(t.createdAt.desc())]
)

export type FetchLogRow = typeof fetchLog.$inferSelect

/**
 * live_ranked — rolling snapshot of the top ~500 ladder entries per queue, used
 * to power the /live "ranked queue" page. One row per leaderboard entry (a
 * player in 1v1, a team in 2v2), keyed by `queue:entityKey`.
 *
 * The Brawlhalla API has no "who's playing right now" endpoint, so we derive it:
 * a cron polls the ALL ladder every few minutes and diffs each entry against its
 * stored snapshot. A rising `games` count means the entry played since the last
 * poll → we stamp `last_active_at`. `session_start_*` capture the rating/rank at
 * the moment an active streak began (reset after a gap), so the page can show
 * the ELO/rank gained this session (eloDiff/rankDiff are computed at read time).
 */
export const liveRanked = pgTable(
  "live_ranked",
  {
    /** `${queue}:${sortedPlayerIds}` — natural identity across polls. */
    id: text("id").primaryKey(),
    /** "1v1" | "2v2". */
    queue: text("queue").notNull(),
    /** Entry region from the ALL ladder (e.g. "us-e"); null if the API omits it. */
    region: text("region"),
    rank: integer("rank").notNull(),
    rating: integer("rating").notNull(),
    /** wins + losses; null when the API returned them null. Activity signal. */
    games: integer("games"),
    /** Entry members: [{ id, name }] — 1 for 1v1, 2 for 2v2. */
    players: jsonb("players").notNull(),
    /** Rating/rank when the current active streak began. */
    sessionStartRating: integer("session_start_rating").notNull(),
    sessionStartRank: integer("session_start_rank").notNull(),
    /** Last poll at which this entry's game count rose. Null = never seen active. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("live_ranked_queue_active_idx").on(t.queue, t.lastActiveAt)]
)

export type LiveRankedRow = typeof liveRanked.$inferSelect
export type LiveRankedInsert = typeof liveRanked.$inferInsert

/**
 * valhallan_members — who each (queue, region) ladder currently calls
 * Valhallan, as one row per ladder.
 *
 * Valhallan is the one tier the /ranked payload never returns, so membership
 * has to be read off the leaderboard. The catch measured on US-E 1v1: the
 * tier is NOT a contiguous prefix of the ladder. Rank 121 at 2,507 is not
 * Valhallan; rank 299 at 2,138 is. Neither `rating` nor `best_rating`
 * predicts it — it's the game's own roster snapshot, and players who have
 * since fallen out of the top-N keep the label. So the only way to know the
 * population is to walk until a page holds no Valhallans at all, which is 6-8
 * pages on the big ladders.
 *
 * That walk is too expensive to run per hour behind a render (lib/sync/
 * valhallan-cutoff.ts used to guess at it and truncated by 25-40%), but the
 * daily sync-valhallan cron already pays for exactly this walk to pick who to
 * re-sync — and used to throw the membership away. This table keeps it, so
 * every read side gets the complete set for free.
 *
 * 18 rows (2 queues × 9 regions), a few KB of ids each. Rewritten daily, and
 * only for a ladder whose walk completed — a walk cut short by a 429 leaves
 * the previous, better answer in place rather than overwriting it.
 */
export const valhallanMembers = pgTable(
  "valhallan_members",
  {
    /** "1v1" | "2v2". */
    queue: text("queue").notNull(),
    /** Canonical ApiRegion, never "ALL" — membership is per ladder. */
    region: text("region").notNull(),
    /** Brawlhalla ids at Valhallan on that ladder: number[]. */
    ids: jsonb("ids").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.queue, t.region] })]
)

export type ValhallanMemberRow = typeof valhallanMembers.$inferSelect

/**
 * ranked_snapshots — a player's 1v1 rating over time, powering the profile's
 * rating-history chart. Rows are piggybacked onto upsertPlayerRanked (the
 * single point where every fresh /ranked payload lands: profile views,
 * sync-leaderboard, sync-valhallan), so history accrues at ZERO extra API
 * cost. Writes dedupe on unchanged (rating, games) — storage stays
 * proportional to actual matches played, not to traffic.
 *
 * The composite PK doubles as the read index (`WHERE brawlhalla_id ORDER BY
 * taken_at`). No tier column (derivable from rating + cutoffs at read time)
 * and no peak column (max of the series). Pruned to 180 days by the daily
 * sync-valhallan cron.
 */
/**
 * queue_activity — hourly rollup of how busy the ranked queue is.
 *
 * Answers "when do people actually play". Costs ZERO Brawlhalla API calls:
 * syncLiveQueue already diffs each entry's game count every five minutes to
 * decide who's active, so the number was being computed and thrown away. This
 * table just keeps it (cardinal constraint #1 — piggyback the existing path).
 *
 * One row per (queue, region, hour). `samples` is the number of polls that
 * contributed, and it's incremented for every region the poll SAW, not just
 * ones with activity — otherwise a dead hour would look like a missing hour
 * rather than a quiet one, and the average would be wrong.
 *
 * ~432 rows/day at current region coverage, pruned to 180 days by the daily
 * cron: single-digit MB, forever.
 *
 * Caveat worth remembering when reading it: this measures the players we
 * TRACK (the top-N ladder the live cron polls), not the whole playerbase.
 */
export const queueActivity = pgTable(
  "queue_activity",
  {
    /** "1v1" | "2v2". */
    queue: text("queue").notNull(),
    /** Ladder region the entries belong to, uppercased. */
    region: text("region").notNull(),
    /** Hour-truncated, stored UTC. */
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    /** Polls that reported on this (queue, region) during the hour. */
    samples: integer("samples").notNull().default(0),
    /** Entries observed finishing a match, summed across those polls. */
    active: integer("active").notNull().default(0),
    /** Matches played (sum of game-count deltas) across those polls. */
    matches: integer("matches").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.queue, t.region, t.bucket] })]
)

export type QueueActivityRow = typeof queueActivity.$inferSelect

export const rankedSnapshots = pgTable(
  "ranked_snapshots",
  {
    brawlhallaId: integer("brawlhalla_id").notNull(),
    rating: integer("rating").notNull(),
    /** wins + losses at snapshot time — dedupe key + "played since" signal. */
    games: integer("games").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.brawlhallaId, t.takenAt] })]
)

export type RankedSnapshotRow = typeof rankedSnapshots.$inferSelect

/**
 * valhallan_stats — the meta aggregations, precomputed.
 *
 * The four Valhallan aggregations are the heaviest queries the site runs, and
 * they were on the render path: `unstable_cache` only helps on a HIT, so every
 * cold key made a visitor's request do the work. The key includes region and
 * method, so it was never one entry that warms once — it was ~60 that miss
 * independently, and a miss cost 16–31s before the filter fix and ~0.5–2s
 * after.
 *
 * So the cache is now a cache of a TABLE rather than of a computation. The
 * daily cron writes every variant; readers do one primary-key lookup and, when
 * a row is missing, return empty rather than computing. That is the whole
 * point: a page can be stale, it must not be slow, and "compute it now" on a
 * request is how four connections become zero.
 *
 * `id` is `${kind}:${region}:${method}` — a function of the arguments, so a
 * re-run updates in place. The payload is the reader's own shape, stored whole:
 * these are ~70 legends or ~13 weapons of small numbers, so the entire table is
 * a few hundred KB and reading one row costs nothing (constraint #2 is about
 * scanning blobs across a table, not about fetching one small one by key).
 */
export const valhallanStats = pgTable("valhallan_stats", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type ValhallanStatsRow = typeof valhallanStats.$inferSelect
