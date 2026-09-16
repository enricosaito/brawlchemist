import Link from "next/link"
import { cn } from "@/lib/utils"
import { PeopleTab } from "./people-tab"
import { SystemTab } from "./system-tab"
import { UsersTab } from "./users-tab"

/**
 * Admin panel.
 *
 * Two tabs, because the page answers two unrelated questions: "who is this
 * person to us" and "is the machine keeping up". It used to be one column of
 * six stacked sections, which meant scrolling past the cron table to reach the
 * pro you came to edit — and put a destructive Delete a few hundred pixels
 * from a Clear fetch log.
 *
 * Tab state is a searchParam and the tabs are Links, so the whole thing stays
 * server-rendered and each tab loads only its own data (the People tab never
 * reads the fetch log; the System tab never joins three tables for names).
 */

const TABS = [
  { id: "people", label: "People" },
  { id: "users", label: "Users" },
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
              "rounded px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
              tab === t.id
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground",
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
              : "border-positive/40 bg-positive/10 text-positive",
          )}
        >
          {notice.text}
        </div>
      )}

      {tab === "people" ? (
        <PeopleTab editId={editId} />
      ) : tab === "users" ? (
        <UsersTab />
      ) : (
        <SystemTab />
      )}
    </div>
  )
}

/** One place to decide what the last action said, instead of a nested ternary. */
function noticeFor(sp: {
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
}): { tone: "ok" | "error"; text: string } | null {
  if (sp.error) {
    return {
      tone: "error",
      text:
        sp.error === "upload"
          ? "Skin upload failed — is Vercel Blob set up (BLOB_READ_WRITE_TOKEN)?"
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
