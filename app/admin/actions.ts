"use server"

import { redirect } from "next/navigation"
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

  const skinSrc = String(formData.get("skinSrc") ?? "").trim()
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
  redirect(`/admin?saved=${id}`)
}

export async function deleteOverrideAction(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("brawlhallaId"))
  if (Number.isInteger(id) && id > 0) await deleteOverride(id)
  redirect("/admin?deleted=1")
}
