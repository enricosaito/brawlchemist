import "server-only"

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/**
 * Postgres, through Supabase's transaction pooler (Supavisor, :6543).
 *
 * `prepare: false` and `fetch_types: false` are required there: the pooler
 * hands a different server connection to each transaction, so named prepared
 * statements and a type-introspection round trip do not survive.
 */
const MAX_CONNECTIONS = 4
const IDLE_TIMEOUT_SECONDS = 20

/**
 * Recycle a connection after a minute, and this is the important one.
 *
 * Serverless instances are **frozen** between requests, not torn down, so a
 * module-level pool keeps its sockets open across invocations — sockets whose
 * far end Supavisor has long since closed. On thaw the driver reuses one and
 * writes into a dead socket. That is the top error on this project by volume:
 * **106 `write CONNECTION_CLOSED` in 24 hours**, plus 14 `CONNECT_TIMEOUT`.
 *
 * postgres-js defaults this to a random 30–60 *minutes*, which is a lifetime
 * for an instance that thaws, serves one request and freezes again. A minute
 * means a thawed instance almost always retires its idle connections instead of
 * gambling on them. The timers are suspended while frozen, but an overdue
 * `setTimeout` runs in the timers phase on thaw — ahead of the poll phase that
 * delivers the incoming request — so the stale socket is usually closed before
 * anything tries to use it.
 *
 * It is a probability improvement, not a guarantee, which is why the retry
 * below exists too.
 */
const MAX_LIFETIME_SECONDS = 60
const CONNECT_TIMEOUT_SECONDS = 15

/** Driver errors that mean the query never reached the server. */
const NEVER_EXECUTED = new Set([
  // The socket was closed before or during the write.
  "CONNECTION_CLOSED",
  // The pool was shutting down; nothing was sent.
  "CONNECTION_ENDED",
  // No connection was ever established.
  "CONNECT_TIMEOUT",
])

function neverExecuted(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    NEVER_EXECUTED.has((err as { code: string }).code)
  )
}

type Client = ReturnType<typeof postgres>

/**
 * Retry once when the driver tells us the query never ran.
 *
 * **Safe precisely because of which errors are retried.** These three are
 * raised before or during the socket write, so the server never saw the
 * statement — there is nothing to double-apply, and that is what makes this
 * sound for writes as well as reads. Anything the server actually executed
 * fails with a `PostgresError` carrying a SQL state, which is not in the set
 * and is rethrown untouched.
 *
 * One retry, not a loop: the second attempt gets a freshly opened connection
 * because the dead one has been removed from the pool, so if that also fails
 * the problem is not staleness and retrying again would only add load to a
 * database already in trouble.
 *
 * Wrapping `unsafe` is enough because it is the only entry point drizzle's
 * postgres-js driver uses — as `await client.unsafe(q, p)` and as
 * `await client.unsafe(q, p).values()`. Both shapes are preserved below; the
 * query is re-created per attempt because a postgres-js query object is single
 * use.
 */
function withRetry(client: Client): Client {
  const unsafe = client.unsafe.bind(client)

  function run<T>(exec: () => PromiseLike<T>): Promise<T> {
    return (async () => {
      try {
        return await exec()
      } catch (err) {
        if (!neverExecuted(err)) throw err
        console.warn(
          `[db] ${(err as { code: string }).code} — connection was stale, retrying once`
        )
        return await exec()
      }
    })()
  }

  const wrapped = (query: string, params?: unknown[]) => {
    const once = (values: boolean) =>
      run(() => {
        const q = unsafe(query, params as never)
        return (values ? q.values() : q) as PromiseLike<unknown>
      })
    // Mimics the thenable postgres-js returns, so drizzle can either await it
    // directly or ask for `.values()` first.
    return {
      then: (res: never, rej: never) => once(false).then(res, rej),
      catch: (rej: never) => once(false).catch(rej),
      finally: (f: () => void) => once(false).finally(f),
      values: () => once(true),
    }
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "unsafe") return wrapped
      return Reflect.get(target, prop, receiver)
    },
  }) as Client
}

let cached: PostgresJsDatabase<typeof schema> | null = null

export function db(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use the Supabase 'Transaction pooler' connection string (dashboard → Connect) in .env.local / Vercel env."
    )
  }

  const client = postgres(url, {
    prepare: false,
    fetch_types: false,
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    max_lifetime: MAX_LIFETIME_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
  })

  cached = drizzle(withRetry(client), { schema })
  return cached
}

export { schema }
