"use server"

import { redirect } from "next/navigation"
import { revalidateTag } from "next/cache"
import { put } from "@vercel/blob"
import { adminActorId, requireAdmin } from "@/lib/admin-auth"
import {
  deleteProfile,
  upsertProfile,
  PROFILES_TAG,
  type ProfileInput,
} from "@/lib/sync/profiles"
import { setAccountPlan, setAccountRole } from "@/lib/sync/admin-users"
import { setCronPaused } from "@/lib/sync/cron-controls"
import { unlinkProfile } from "@/lib/sync/claims"
import { clearFlair, FLAIR_MAP_TAG } from "@/lib/sync/customizations"
import { clearFetchLog, recordFetch } from "@/lib/sync/fetch-log"
import { syncManyPlayers, syncPlayer } from "@/lib/sync/players"
import {
  discoverValhallanIds,
  getStaleValhallanIds,
  VALHALLAN_STATS_TAG,
} from "@/lib/sync/valhallan"

/**
 * Ceiling for an uploaded favorite skin.
 *
 * Generous enough for a short animated GIF, tight enough that one can't become
 * the heaviest thing on a profile. Stills sit around 100-400 KB.
 */
const MAX_SKIN_BYTES = 3 * 1024 * 1024

export async function saveProfileAction(formData: FormData) {
  await requireAdmin()

  const id = Number(formData.get("brawlhallaId"))
  if (!Number.isInteger(id) || id <= 0) redirect("/admin?error=bad-id")

  // A picked file wins over the pasted path: upload it to Vercel Blob and use
  // the returned public URL as the skin src.
  let skinSrc = String(formData.get("skinSrc") ?? "").trim()
  const file = formData.get("skinFile")
  if (file instanceof File && file.size > 0) {
    // Nothing enforced the size guidance before, which mattered less when every
    // skin was a ~100 KB still. An animated GIF is served whole and uncompressed
    // — Next's optimizer detects animation and passes the file through
    // untouched, which is what keeps it moving — so its full weight lands on
    // every profile view, the leaderboard podium included.
    if (file.size > MAX_SKIN_BYTES) {
      redirect("/admin?error=skin-too-large")
    }
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const blob = await put(`skins/${id}-${Date.now()}-${safe}`, file, {
        access: "public",
        addRandomSuffix: false,
      })
      skinSrc = blob.url
    } catch (err) {
      console.error("[admin] skin upload failed:", err)
      redirect("/admin?error=upload")
    }
  }

  const skinName = String(formData.get("skinName") ?? "").trim()
  const input: ProfileInput = {
    brawlhallaId: id,
    isPro: formData.get("isPro") === "on",
    handle: String(formData.get("handle") ?? "").trim() || null,
    favoriteSkin: skinSrc ? { src: skinSrc, name: skinName } : null,
    // Achievements: one championship title per line.
    achievements: String(formData.get("achievements") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  }

  await upsertProfile(input)

  // Pull the player's ranked standing now so they appear on the pro board
  // immediately. Fail open — the read-through cache on the profile page will
  // re-fetch on the next view if the API is unavailable right now.
  try {
    const outcome = await syncPlayer(id, { force: true })
    await recordFetch({
      brawlhallaId: id,
      source: "admin-save",
      result: outcome.status === "synced" ? "synced" : "failed",
      client: "admin",
    })
  } catch (err) {
    console.error("[admin] pro sync on save failed:", err)
    await recordFetch({
      brawlhallaId: id,
      source: "admin-save",
      result: "failed",
      client: "admin",
    })
  }

  redirect(`/admin?saved=${id}`)
}

export async function deleteProfileAction(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("brawlhallaId"))
  if (Number.isInteger(id) && id > 0) await deleteProfile(id)
  redirect("/admin?deleted=1")
}

export async function toggleCronAction(formData: FormData) {
  await requireAdmin()
  const key = String(formData.get("key") ?? "")
  // The form sends the desired next state, so the click is idempotent.
  const paused = String(formData.get("paused")) === "true"
  await setCronPaused(key, paused)
  redirect("/admin?tab=system#crons")
}

/**
 * Walk both 1v1 and 2v2 region=ALL leaderboards for Valhallan-tier ids and
 * sync each player's full ranked payload. "ALL" is the cheapest discovery —
 * one paginated combo per queue vs nine regions each. The 2v2 walk catches
 * top-team players the 1v1 walk misses (each 2v2 entry contributes both
 * teammates), at the cost of pulling some mid-1v1-tier players (top-2v2
 * mains often Plat/Gold in 1v1).
 *
 * Capped at ~40 players per click so the throttled syncs (5s/call) fit within
 * Vercel's 300s function ceiling. Idempotent (TTL-gated) — re-click to drain.
 */
export async function backfillValhallansAction() {
  await requireAdmin()

  const discovered = new Set<number>()
  for (const queue of ["1v1", "2v2"] as const) {
    const { ids } = await discoverValhallanIds(queue, "ALL")
    for (const id of ids) discovered.add(id)
  }
  if (discovered.size === 0) {
    redirect("/admin?tab=system&backfill=none")
  }

  const stale = await getStaleValhallanIds(discovered)
  if (stale.length === 0) {
    redirect("/admin?tab=system&backfill=caughtup")
  }

  const PER_CLICK = 40
  const batch = stale.slice(0, PER_CLICK)
  const outcomes = await syncManyPlayers(batch, {
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  })
  const synced = outcomes.filter((o) => o.status === "synced").length
  const failed = outcomes.filter((o) => o.status === "failed").length
  const remaining = Math.max(stale.length - batch.length, 0)

  redirect(
    `/admin?tab=system&backfill=${synced}&remaining=${remaining}${failed ? `&failed=${failed}` : ""}`,
  )
}

/** Truncate the fetch_log table (admin maintenance). */
export async function clearFetchLogAction() {
  await requireAdmin()
  await clearFetchLog()
  redirect("/admin?tab=system&cleared=log")
}

/**
 * Drop the shared read caches so the next render reads the database.
 *
 * Every cached read here is invalidated by the write that owns it —
 * `upsertProfile` busts "profiles", `setFlair` busts "flair-map". That only
 * holds for writes that go through the app. A row changed in the SQL editor
 * (a repair, a manual seed, a bulk edit) leaves the caches untouched and the
 * site keeps serving the old value for up to an hour, inconsistently: the
 * Data Cache is regional, so one visitor sees the fix and the next doesn't.
 *
 * That is exactly how two pros silently lost their flair after their rows were
 * repaired directly, and there was no way to fix it short of re-saving a
 * profile to piggyback on its revalidation. This is that button.
 *
 * Cheap and safe to press: it discards cached values, it does not delete
 * anything, and the next request repopulates from Postgres.
 */
export async function refreshCachesAction() {
  await requireAdmin()
  revalidateTag(PROFILES_TAG, "max")
  revalidateTag(FLAIR_MAP_TAG, "max")
  revalidateTag(VALHALLAN_STATS_TAG, "max")
  redirect("/admin?tab=system&refreshed=caches")
}

/**
 * Set an account's role — the permission axis (admin).
 *
 * Validation and the self-change refusal both live in `setAccountRole`, not
 * here, so the rules hold for any future caller and not just this form. There
 * is deliberately no user-facing counterpart: nothing outside this action
 * writes `account_role`, which is what makes self-elevation impossible rather
 * than merely unrendered.
 */
export async function setAccountRoleAction(formData: FormData) {
  await requireAdmin()
  const userId = String(formData.get("userId") ?? "")
  const role = String(formData.get("role") ?? "")
  const result = await setAccountRole(userId, role, await adminActorId())
  redirect(
    result.ok
      ? "/admin?tab=users&accountsaved=role"
      : `/admin?tab=users&error=account-${result.reason}`,
  )
}

/**
 * Set an account's plan — the subscription axis (admin).
 *
 * Manual for now; when billing exists this is the seam a webhook writes
 * through. No self-guard, because a plan carries no permissions and changing
 * your own is not an escalation — which is precisely why it is a separate
 * column from the role.
 */
export async function setAccountPlanAction(formData: FormData) {
  await requireAdmin()
  const userId = String(formData.get("userId") ?? "")
  const plan = String(formData.get("plan") ?? "")
  const result = await setAccountPlan(userId, plan)
  redirect(
    result.ok
      ? "/admin?tab=users&accountsaved=plan"
      : `/admin?tab=users&error=account-${result.reason}`,
  )
}

/** Release a profile's ownership (admin). Curation is left intact. */
export async function unlinkProfileAction(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("brawlhallaId"))
  if (Number.isInteger(id) && id > 0) await unlinkProfile(id)
  redirect("/admin?unlinked=1")
}

/** Reset a player's flair choice to the automatic pick (admin). */
export async function clearFlairAction(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("brawlhallaId"))
  if (Number.isInteger(id) && id > 0) await clearFlair(id)
  redirect("/admin?flaircleared=1")
}
