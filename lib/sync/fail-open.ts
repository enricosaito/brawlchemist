import "server-only"

/**
 * Fail open around a cached read — on the OUTSIDE of the cache, never inside.
 *
 * Cardinal constraint #5 says enrichment degrades to plain rendering rather
 * than taking a page down, and every cached reader on the site honoured that by
 * catching its own error and returning an empty value. Put that catch *inside*
 * `unstable_cache` and the two correct ideas combine into an outage: the empty
 * value is a successful return, so the cache stores it and serves it as fact
 * for the whole revalidate window, and every failed refresh renews the lie.
 *
 * That is not hypothetical. On 2026-09-18 a single `CONNECT_TIMEOUT` to the
 * Supabase pooler emptied `getProfilesObject`, which has a 1-hour window — and
 * for an hour, across the entire site, not one pro had a handle, no profile was
 * a linked account, no flair was earned, no favourite skin rendered and no
 * esports title showed. The database was healthy the whole time: all four of
 * its reads answered in under two seconds when measured. Production was serving
 * an hour-old failure.
 *
 * So the rule is: **a cached function must throw on failure.** A thrown error
 * is not cached, so the next request retries and the first success repairs
 * everything. The fallback lives out here, where it costs one render instead of
 * a window.
 *
 * `fallback` is a value rather than a factory on purpose — every caller's is a
 * fresh empty literal at the call site, and sharing a mutable one across
 * requests is the other way this goes wrong.
 */

/**
 * How long a failure suppresses retries, per reader, per instance.
 *
 * Without it, "don't cache the failure" becomes "retry on every single
 * request", and a database that is down — rather than blipping — would take a
 * `connect_timeout` (15s) on every render and add connection pressure to the
 * thing already struggling. Ten seconds is the whole trade in one number: an
 * outage costs one slow request per instance per ten seconds instead of one per
 * request, and a recovery is visible within ten seconds instead of an hour.
 *
 * Module state, so it is per serverless instance and evaporates with it. That
 * is the right scope for a circuit breaker — it is a fact about this process's
 * last attempt, not about the world, and nothing else should inherit it.
 */
const FAILURE_COOLDOWN_MS = 10_000
const lastFailure = new Map<string, number>()

export async function failOpen<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  const failedAt = lastFailure.get(label)
  if (failedAt !== undefined && Date.now() - failedAt < FAILURE_COOLDOWN_MS) {
    return fallback
  }
  try {
    const value = await read()
    lastFailure.delete(label)
    return value
  } catch (err) {
    lastFailure.set(label, Date.now())
    console.error(`${label} read failed (serving fallback, not caching):`, err)
    return fallback
  }
}
