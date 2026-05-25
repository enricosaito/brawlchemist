// Seeds the player_overrides table with the originally-hardcoded verified pros.
// Idempotent (ON CONFLICT DO UPDATE) — safe to re-run. Usage: node scripts/seed-overrides.mjs
import { neon } from "@neondatabase/serverless"
import { config } from "dotenv"

config({ path: ".env.local" })

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL

if (!url) {
  console.error("No DATABASE_URL in .env.local")
  process.exit(1)
}

const sql = neon(url)

const pros = [
  {
    id: 8851646,
    handle: "Kyna",
    skin: {
      src: "/assets/TEROS_FallenPrinceTeros_ClassicColors.png",
      name: "Fallen Prince Teros",
    },
    achievements: [
      "2v2 World Champion '24",
      "1v1 Midseason Champion '24",
      "2v2 Midseason Champion '24",
    ],
  },
  {
    id: 5461700,
    handle: "Lopes",
    skin: {
      src: "/assets/SIDRA_PirateQueenSidra_WillowLeaves.png",
      name: "Pirate Queen Sidra",
    },
    achievements: [],
  },
  {
    id: 5989758,
    handle: "yüz",
    skin: {
      src: "/assets/EMBER_Fangwild'sHeartEmber_WillowLeaves_Movement_Bow_NeutralSignature_Original_Original_1_410x346.png",
      name: "Fangwild's Heart Ember",
    },
    achievements: [],
  },
]

for (const p of pros) {
  await sql`
    INSERT INTO player_overrides (brawlhalla_id, pro, handle, favorite_skin, achievements, updated_at)
    VALUES (${p.id}, true, ${p.handle}, ${JSON.stringify(p.skin)}::jsonb, ${JSON.stringify(p.achievements)}::jsonb, now())
    ON CONFLICT (brawlhalla_id) DO UPDATE SET
      pro = excluded.pro,
      handle = excluded.handle,
      favorite_skin = excluded.favorite_skin,
      achievements = excluded.achievements,
      updated_at = now()
  `
  console.log(`seeded ${p.id} (${p.handle})`)
}

console.log("done")
