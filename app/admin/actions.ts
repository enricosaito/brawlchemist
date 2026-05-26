"use server"

import { redirect } from "next/navigation"
import { put } from "@vercel/blob"
import {
  createAdminSession,
  destroyAdminSession,
  requireAdmin,
} from "@/lib/admin-auth"
import {
  deleteOverride,
  upsertOverride,
  type OverrideInput,
} from "@/lib/sync/player-overrides"
import { setCronPaused } from "@/lib/sync/cron-controls"
import { syncPlayer } from "@/lib/sync/players"

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "")
  const ok = await createAdminSession(password)
  redirect(ok ? "/admin" : "/admin/login?error=1")
}

export async function logoutAction() {
  await destroyAdminSession()
  redirect("/admin/login")
}

export async function saveOverrideAction(formData: FormData) {
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
  const input: OverrideInput = {
    brawlhallaId: id,
    pro: formData.get("pro") === "on",
    handle: String(formData.get("handle") ?? "").trim() || null,
    favoriteSkin: skinSrc ? { src: skinSrc, name: skinName } : null,
    // Achievements: one championship title per line.
    achievements: String(formData.get("achievements") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  }

  await upsertOverride(input)

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

export async function deleteOverrideAction(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("brawlhallaId"))
  if (Number.isInteger(id) && id > 0) await deleteOverride(id)
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
