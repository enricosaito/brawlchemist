import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PlayerLink } from "@/components/site/primitives"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getGuildStats, type GuildMember } from "@/lib/brawlhalla-api"
import { fetchGuildMembers, getGuildById, upsertGuild } from "@/lib/sync/guilds"

interface GuildView {
  guildId: number
  name: string
  rank: number | null
  xp: number | null
  legacyXp: number | null
  guildPoints: number | null
  memberCount: number | null
  createDate: number | null
  tags: string[]
  isRecruiting: boolean
  notice: string | null
  discordInviteCode: string | null
  members: GuildMember[]
}

const num = (n: number | null) => (n == null ? "—" : n.toLocaleString())

function fmtDate(unix: number | null): string {
  if (!unix) return "—"
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Leader → Officer → Member → anything else, then by guild points desc.
const ROLE_ORDER: Record<string, number> = { Leader: 0, Officer: 1, Member: 2 }
function sortMembers(members: GuildMember[]): GuildMember[] {
  return [...members].sort((a, b) => {
    const ra = ROLE_ORDER[a.rank] ?? 3
    const rb = ROLE_ORDER[b.rank] ?? 3
    if (ra !== rb) return ra - rb
    return (b.guild_points ?? 0) - (a.guild_points ?? 0)
  })
}

/**
 * Load a guild: prefer a live fetch (and refresh the pool from it), falling
 * back to the cached DB row when the API is unavailable. Returns null when the
 * guild can't be found either way.
 */
async function loadGuild(guildId: number): Promise<GuildView | null> {
  const [stats, liveMembers] = await Promise.all([
    getGuildStats(guildId),
    fetchGuildMembers(guildId),
  ])

  if (stats.ok) {
    // The members endpoint often 500s; when it does, keep the last snapshot we
    // stored rather than showing an empty list.
    let members = liveMembers
    if (members === undefined) {
      const prior = await getGuildById(guildId)
      members = Array.isArray(prior?.membersJson)
        ? (prior!.membersJson as GuildMember[])
        : []
    }
    // Populate/refresh the pool for free on view. Don't let a write error
    // block rendering.
    try {
      await upsertGuild(stats.data, liveMembers)
    } catch (err) {
      console.error("[guild] upsert on view failed:", err)
    }
    const s = stats.data
    return {
      guildId: s.guild_id,
      name: s.name,
      rank: s.rank ?? null,
      xp: s.xp ?? null,
      legacyXp: s.legacy_xp ?? null,
      guildPoints: s.guild_points ?? null,
      memberCount: s.member_count ?? members.length ?? null,
      createDate: s.create_date ?? null,
      tags: Array.isArray(s.tags) ? s.tags : [],
      isRecruiting: !!s.is_recruiting,
      notice: s.notice || null,
      discordInviteCode: s.discord_invite_code || null,
      members,
    }
  }

  // Live fetch failed — fall back to whatever we last stored.
  const row = await getGuildById(guildId)
  if (!row) return null
  return {
    guildId: row.guildId,
    name: row.name,
    rank: row.rank,
    xp: row.xp,
    legacyXp: row.legacyXp,
    guildPoints: row.guildPoints,
    memberCount: row.memberCount,
    createDate: row.createDate,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    isRecruiting: !!row.isRecruiting,
    notice: row.notice,
    discordInviteCode: row.discordInviteCode,
    members: Array.isArray(row.membersJson)
      ? (row.membersJson as GuildMember[])
      : [],
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const row = await getGuildById(Number(id))
  const name = row?.name ?? "Guild"
  return {
    title: `${name} · Guild · Brawlchemist`,
    description: `${name} — Brawlhalla guild stats and members.`,
  }
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums">
        {value}
      </div>
    </div>
  )
}

function buildMemberColumns(): ColDef<GuildMember>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "56px",
      align: "right",
      render: (_, i) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {i + 1}
        </span>
      ),
    },
    {
      id: "member",
      label: "Member",
      render: (m) => (
        <PlayerLink
          id={m.brawlhalla_id}
          className="truncate text-sm font-medium"
        >
          {m.name}
        </PlayerLink>
      ),
    },
    {
      id: "role",
      label: "Role",
      width: "110px",
      render: (m) => (
        <span
          className={cn(
            "font-mono text-[11px] font-medium uppercase tracking-wider",
            m.rank === "Leader"
              ? "text-tier-s"
              : m.rank === "Officer"
                ? "text-tier-valhallan"
                : "text-muted-foreground",
          )}
        >
          {m.rank}
        </span>
      ),
    },
    {
      id: "points",
      label: "Weekly Pts",
      align: "right",
      width: "120px",
      render: (m) => (
        <span className="font-mono text-sm tabular-nums text-tier-s">
          {num(m.guild_points ?? null)}
        </span>
      ),
    },
    {
      id: "xp",
      label: "Guild XP",
      align: "right",
      width: "140px",
      render: (m) => (
        <span className="font-mono text-sm tabular-nums">
          {num(m.xp ?? null)}
        </span>
      ),
    },
    {
      id: "joined",
      label: "Joined",
      align: "right",
      width: "130px",
      render: (m) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {fmtDate(m.join_date ?? null)}
        </span>
      ),
    },
  ]
}

export default async function GuildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const guildId = Number(id)
  if (!Number.isInteger(guildId) || guildId <= 0) notFound()

  const guild = await loadGuild(guildId)
  if (!guild) notFound()

  const members = sortMembers(guild.members)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <div className="px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="mx-auto max-w-[1280px]">
            <Link
              href="/guilds"
              className="mb-4 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Guild rankings
            </Link>

            {/* Header */}
            <div className="rounded-xl border border-border/60 bg-card/40 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-bold">{guild.name}</h1>
                {guild.rank != null && (
                  <span className="rounded-md border border-tier-valhallan/40 bg-tier-valhallan/10 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-tier-valhallan">
                    Rank #{guild.rank.toLocaleString()}
                  </span>
                )}
                {guild.isRecruiting && (
                  <span className="rounded-md border border-positive/40 bg-positive/10 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-positive">
                    Recruiting
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>Created {fmtDate(guild.createDate)}</span>
                {guild.tags.length > 0 && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {guild.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  </>
                )}
                {guild.discordInviteCode && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <a
                      href={`https://discord.gg/${guild.discordInviteCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-mystic transition-colors hover:text-foreground"
                    >
                      Discord
                    </a>
                  </>
                )}
              </div>

              {guild.notice && (
                <p className="mt-3 border-l-2 border-border/60 pl-3 text-sm italic text-muted-foreground">
                  {guild.notice}
                </p>
              )}
            </div>

            {/* Stat tiles */}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Total XP" value={num(guild.xp)} />
              <StatTile label="Legacy XP" value={num(guild.legacyXp)} />
              <StatTile label="Weekly Points" value={num(guild.guildPoints)} />
              <StatTile
                label="Members"
                value={num(guild.memberCount ?? members.length)}
              />
            </div>

            {/* Members */}
            <h2 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
              Members
            </h2>
            {members.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                Member list isn&apos;t available for this guild right now.
              </div>
            ) : (
              <DataTable
                columns={buildMemberColumns()}
                rows={members}
                rowKey={(m) => String(m.brawlhalla_id)}
              />
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
