import Link from "next/link"
import { cn } from "@/lib/utils"
import { CombosTab } from "./combos-tab"
import { FlairsTab } from "./flairs-tab"
import { PeopleTab } from "./people-tab"
import { SystemTab } from "./system-tab"
import { UsersTab } from "./users-tab"

/**
 * Admin panel.
 *
 * One tab per question the panel answers: who is this person to us, what is
 * this account allowed to do, what badges exist, and is the machine keeping up.
 * It used to be one column of stacked sections, which meant scrolling past the
 * cron table to reach the pro you came to edit — and put a destructive Delete a
 * few hundred pixels from a Clear fetch log.
 *
 * Tab state is a searchParam and the tabs are Links, so the whole thing stays
 * server-rendered and each tab loads only its own data (the People tab never
 * reads the fetch log; the System tab never joins three tables for names).
 */

const TABS = [
  { id: "people", label: "People" },
  { id: "users", label: "Users" },
  { id: "flairs", label: "Flairs" },
  { id: "combos", label: "Combos" },
  { id: "system", label: "System" },
] as const

type TabId = (typeof TABS)[number]["id"]

function isTab(value: string | undefined): value is TabId {
  return TABS.some((t) => t.id === value)
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    edit?: string
    editflair?: string
    editcombo?: string
    combosaved?: string
    combodeleted?: string
    flairsaved?: string
    flairdeleted?: string
    flairimported?: string
    flairgranted?: string
    flairrevoked?: string
    saved?: string
    deleted?: string
    unlinked?: string
    flaircleared?: string
    error?: string
    backfill?: string
    remaining?: string
    failed?: string
    cleared?: string
    accountsaved?: string
  }>
}) {
  const sp = await searchParams
  // People is the default: it is what the panel is mostly for, and every
  // person-shaped redirect (?saved, ?deleted, ?edit) lands back on it without
  // having to carry a tab.
  const tab: TabId = isTab(sp.tab) ? sp.tab : "people"
  const editId = sp.edit ? Number(sp.edit) : null

  const notice = noticeFor(sp)

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex w-fit items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "rounded px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
              tab === t.id
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {notice && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            notice.tone === "error"
              ? "border-negative/40 bg-negative/10 text-negative"
              : "border-positive/40 bg-positive/10 text-positive"
          )}
        >
          {notice.text}
        </div>
      )}

      {tab === "people" ? (
        <PeopleTab editId={editId} />
      ) : tab === "users" ? (
        <UsersTab />
      ) : tab === "flairs" ? (
        <FlairsTab editId={sp.editflair ?? null} />
      ) : tab === "combos" ? (
        <CombosTab editId={sp.editcombo ?? null} />
      ) : (
        <SystemTab />
      )}
    </div>
  )
}

/** One place to decide what the last action said, instead of a nested ternary. */
function noticeFor(sp: {
  saved?: string
  combosaved?: string
  combodeleted?: string
  flairsaved?: string
  flairdeleted?: string
  flairimported?: string
  flairgranted?: string
  flairrevoked?: string
  deleted?: string
  unlinked?: string
  flaircleared?: string
  error?: string
  backfill?: string
  remaining?: string
  failed?: string
  cleared?: string
  accountsaved?: string
}): { tone: "ok" | "error"; text: string } | null {
  if (sp.error) {
    return {
      tone: "error",
      text:
        sp.error === "upload"
          ? "Upload failed — is Vercel Blob set up (BLOB_READ_WRITE_TOKEN)?"
          : sp.error === "flair-too-large"
            ? "That art is over 128 KB. Flair renders on every leaderboard row, so the file size lands fifty times on one screen — export it around 192px."
            : sp.error === "flair-not-png"
              ? "That file isn’t a PNG. Dimensions are read out of the PNG header, so the format is the check."
              : sp.error === "flair-image"
                ? "A flair needs art — upload a PNG."
                : sp.error === "flair-id"
                  ? "That isn’t a usable id. Lowercase letters, digits and dashes."
                  : sp.error === "flair-label"
                    ? "A flair needs a label — it’s the tooltip players see."
                    : sp.error === "flair-exists"
                      ? "A flair with that id already exists. Edit it instead, or pick another id."
                      : sp.error === "flair-not-found"
                        ? "No such flair — it may have been deleted since this page loaded."
                        : sp.error === "blob-unconfigured"
                          ? "No Blob store is connected to this project, so there is nowhere to put the file. Connect one in the Vercel dashboard — BLOB_READ_WRITE_TOKEN is injected automatically once you do."
                          : sp.error === "clip-too-large"
                            ? "That clip is over 4 MB. Encode it at 480p/30fps with no audio — a 3-second combo should land near 250 KB."
                            : sp.error === "clip-type"
                              ? "Clips must be mp4 or webm; posters webp, jpeg or png."
                              : sp.error === "combo-weapon"
                                ? "That isn’t a weapon we know."
                                : sp.error === "combo-notation"
                                  ? "A clip needs its notation — it’s the caption under the video."
                                  : sp.error === "combo-clip"
                                    ? "A new clip needs a video file."
                                    : sp.error === "combo-id"
                                      ? "That notation doesn’t reduce to a usable id. Give the clip an explicit one."
                                      : sp.error === "skin-src"
                                        ? "That skin path can’t be fetched. Use an https:// URL or a path starting with / (e.g. /assets/my-skin.png) — a bare filename stores fine and then renders nothing."
                                        : sp.error === "skin-too-large"
                                          ? "That skin is over 3 MB. An animated GIF is served whole on every profile view — trim the frames or the dimensions and try again."
                                          : sp.error === "account-self"
                                            ? "You can’t change your own role. Ask another Developer, or use ADMIN_BOOTSTRAP_EMAILS."
                                            : sp.error === "account-not-found"
                                              ? "No such account — it may have been removed since this page loaded."
                                              : sp.error === "account-invalid"
                                                ? "That isn’t a role or plan we recognise."
                                                : "Couldn’t save — check the Brawlhalla ID.",
    }
  }
  if (sp.accountsaved) {
    return {
      tone: "ok",
      text:
        sp.accountsaved === "plan"
          ? "Plan updated. Plans carry no permissions."
          : "Role updated.",
    }
  }
  if (sp.combosaved) {
    return { tone: "ok", text: "Clip saved. Live on The Lab now." }
  }
  if (sp.combodeleted) {
    return {
      tone: "ok",
      text: "Clip removed from the library. The uploaded file is left in Blob storage.",
    }
  }
  if (sp.flairsaved) {
    return { tone: "ok", text: `Saved ${sp.flairsaved}. Live everywhere now.` }
  }
  if (sp.flairdeleted) {
    return {
      tone: "ok",
      text: "Flair deleted, along with its grants. Players who had selected it fall back to their best earned one.",
    }
  }
  if (sp.flairimported) {
    return {
      tone: "ok",
      text:
        sp.flairimported === "0"
          ? "Built-ins already imported — nothing to add."
          : `Imported ${sp.flairimported} built-in flair${sp.flairimported === "1" ? "" : "s"}. They’re editable now.`,
    }
  }
  if (sp.flairgranted) {
    return {
      tone: "ok",
      text: `Granted to #${sp.flairgranted}. They still choose whether to fly it.`,
    }
  }
  if (sp.flairrevoked) return { tone: "ok", text: "Grant revoked." }
  if (sp.deleted) return { tone: "ok", text: "Profile removed." }
  if (sp.unlinked) {
    return {
      tone: "ok",
      text: "Account unlinked — the profile can be claimed again. Pro status and titles were left as they were.",
    }
  }
  if (sp.flaircleared) {
    return {
      tone: "ok",
      text: "Flair choice cleared — they're back to showing their best earned one.",
    }
  }
  if (sp.cleared === "log") return { tone: "ok", text: "Fetch log cleared." }
  if (sp.backfill === "none") {
    return {
      tone: "ok",
      text: "No Valhallans discovered — leaderboard returned empty.",
    }
  }
  if (sp.backfill === "caughtup") {
    return {
      tone: "ok",
      text: "All Valhallans already cached — nothing to backfill.",
    }
  }
  if (sp.backfill) {
    const remaining = Number(sp.remaining ?? 0)
    return {
      tone: "ok",
      text: `Backfilled ${sp.backfill} Valhallan${sp.backfill === "1" ? "" : "s"}.${
        remaining > 0
          ? ` ${remaining} stale remaining — click again to continue.`
          : ""
      }${sp.failed ? ` (${sp.failed} failed — likely rate-limited.)` : ""}`,
    }
  }
  if (sp.saved) {
    return { tone: "ok", text: `Saved ${sp.saved} (syncing their standing…).` }
  }
  return null
}
