/**
 * Repair upstream's double-encoded UTF-8.
 *
 * The Brawlhalla API serves `application/json` but builds its JSON escapes by
 * treating already-UTF-8 bytes as Latin-1, so an accented name arrives with
 * each byte promoted to its own codepoint. Verified against the live API:
 *
 *     GET /player/8851646/ranked  ->  "LGN | AretÃ©"
 *     reinterpreted latin1->utf8  ->  "LGN | Areté"
 *
 * It is not a font problem and no display-side change fixes it — the mangled
 * text is in the payload, and from there in our database (952 of 91,088
 * usernames when this was written).
 *
 * The repair is deliberately conservative, because the failure mode of a
 * too-eager version is corrupting names that are legitimately non-ASCII:
 *
 *   1. Bail unless the string carries the telltale pattern — a Latin-1
 *      supplement lead byte followed by a continuation byte.
 *   2. Bail if the round trip doesn't reproduce the input exactly. Anything
 *      that isn't genuinely mis-decoded UTF-8 fails this.
 *   3. Bail on U+FFFD, which means the bytes weren't valid UTF-8 after all.
 *
 * Anything that doesn't pass all three is returned untouched.
 */

/** A UTF-8 lead byte (C2-F4) followed by a continuation byte (80-BF). */
const MOJIBAKE = /[Â-ô][-¿]/

export function repairMojibake(value: string): string {
  if (!MOJIBAKE.test(value)) return value
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8")
    if (repaired.includes("�")) return value
    // Round trip: re-encoding the repair must reproduce the input byte for
    // byte, or this wasn't double-encoded text to begin with.
    if (Buffer.from(repaired, "utf8").toString("latin1") !== value) return value
    return repaired
  } catch {
    return value
  }
}

/**
 * Apply `repairMojibake` to every string in a parsed JSON value.
 *
 * Returns the input unchanged when nothing needed repairing, so the common
 * case allocates nothing — most payloads are pure ASCII and every string exits
 * on the regex test.
 */
export function repairJson<T>(value: T): T {
  if (typeof value === "string") {
    return repairMojibake(value) as unknown as T
  }
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((item) => {
      const next = repairJson(item)
      if (next !== item) changed = true
      return next
    })
    return (changed ? out : value) as unknown as T
  }
  if (value && typeof value === "object") {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = repairJson(v)
      if (next !== v) changed = true
      out[k] = next
    }
    return (changed ? out : value) as unknown as T
  }
  return value
}
