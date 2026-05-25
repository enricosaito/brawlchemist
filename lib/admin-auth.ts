import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Lightweight single-admin auth: a password (ADMIN_PASSWORD) exchanged for an
 * HMAC-signed, httpOnly session cookie (signed with ADMIN_SESSION_SECRET).
 * There's no user table — it's one operator (the site owner). Guards run
 * server-side on the admin panel layout AND every mutation, so the routes are
 * protected even though the page is reachable.
 */
const COOKIE = "bc_admin"
const MAX_AGE_S = 60 * 60 * 24 * 30 // 30 days

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s) throw new Error("ADMIN_SESSION_SECRET is not set.")
  return s
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

/** Constant-time compare of two equal-purpose strings (signatures/digests). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function makeToken(): string {
  const payload = String(Date.now())
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const providedSig = token.slice(dot + 1)
  if (!safeEqual(providedSig, sign(payload))) return false
  const issued = Number(payload)
  if (!Number.isFinite(issued)) return false
  return Date.now() - issued < MAX_AGE_S * 1000
}

export async function isAdmin(): Promise<boolean> {
  try {
    const token = (await cookies()).get(COOKIE)?.value
    return verifyToken(token)
  } catch {
    return false
  }
}

/** Redirect to the login page unless a valid admin session is present. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login")
}

/** Validate the password and set the session cookie. True on success. */
export async function createAdminSession(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected || !password) return false
  // Compare HMACs (fixed length) so neither timing nor length leaks the secret.
  if (!safeEqual(sign(password), sign(expected))) return false
  ;(await cookies()).set(COOKIE, makeToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  })
  return true
}

export async function destroyAdminSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}
