import { config as loadEnv } from "dotenv"
import type { Config } from "drizzle-kit"

loadEnv({ path: ".env.local" })

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Drizzle-kit needs the unpooled connection string to run migrations.",
  )
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config
