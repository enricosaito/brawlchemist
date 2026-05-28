"use server"

import { redirect } from "next/navigation"
import { put } from "@vercel/blob"
import {
  createAdminSession,
  destroyAdminSession,
  requireAdmin,
} from "@/lib/admin-auth"
import {
  deleteProfile,
  upsertProfile,
  type ProfileInput,
} from "@/lib/sync/profiles"
import { setCronPaused } from "@/lib/sync/cron-controls"
import { syncManyPlayers, syncPlayer } from "@/lib/sync/players"
import {
  discoverValhallanIds,
  getStaleValhallanIds,
} from "@/lib/sync/valhallan"

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "")
  const ok = await createAdminSession(password)
  redirect(ok ? "/admin" : "/admin/login?error=1")
}

export async function logoutAction() {
  await destroyAdminSession()
  redirect("/admin/login")
}

export async function saveProfileAction(formData: FormData) {
  await requireAdmin()

  const id = Number(formData.get("brawlhallaId"))
  if (!Number.isInteger(id) || id <= 0) redirect("/admin?error=bad-id")

  // A picked file wins over the pasted path: upload it to Vercel Blob and use
  // the returned public URL as the skin src.
  let skinSrc = String(formData.get("skinSrc") ?? "").trim()
  const file = formData.get("skinFile")
  if (file instanceof File && file.size > 0) {
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
  // immediately; the sync-pros cron keeps it fresh afterward. Fail open — the
  // cron will retry if the API is unavailable right now.
  try {
    await syncPlayer(id, { force: true })
  } catch (err) {
    console.error("[admin] pro sync on save failed:", err)
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
  redirect("/admin#crons")
}

/**
 * Walk the 1v1 region=ALL leaderboard for Valhallan-tier ids and sync each
 * player's full ranked payload into the pool. Cheaper than the per-region
 * discovery the daily cron does, since "ALL" returns the global top players
 * in one paginated call.
 *
 * Capped at ~40 players per click so the throttled syncs (5s/call) fit within
 * Vercel's 300s function ceiling. Idempotent (TTL-gated) — re-click to drain.
 */
export async function backfillValhallansAction() {
  await requireAdmin()

  const ids = await discoverValhallanIds("1v1", "ALL")
  if (ids.length === 0) {
    redirect("/admin?backfill=none")
  }

  const stale = await getStaleValhallanIds(new Set(ids))
  if (stale.length === 0) {
    redirect("/admin?backfill=caughtup")
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
    `/admin?backfill=${synced}&remaining=${remaining}${failed ? `&failed=${failed}` : ""}`,
  )
}
