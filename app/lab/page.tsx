import Link from "next/link"
import type { Metadata } from "next"
import { WEAPON_NAMES } from "@/lib/mock-data"
import { combosFor, totalCombos, type TrueCombo } from "@/lib/true-combos"
import type { WeaponId } from "@/lib/types"
import { PageHero } from "@/components/site/page-hero"
import { WeaponIcon } from "@/components/site/primitives"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Brawlchemist | The Lab",
  description:
    "True combos for every Brawlhalla weapon — the strings that cannot be escaped once the first hit lands, on video.",
}

const WEAPONS = Object.keys(WEAPON_NAMES) as WeaponId[]

function isWeapon(v: string | undefined): v is WeaponId {
  return !!v && (WEAPONS as string[]).includes(v)
}

/**
 * The Lab — true combos, by weapon.
 *
 * A weapon at a time rather than every clip on one page. A true combo is
 * something you look up while holding a specific weapon, so the weapon is the
 * question and the clips are the answer; a single scroll of two hundred videos
 * would be a library nobody reads and a page nobody can load.
 *
 * Server-rendered off `?weapon=`, like every other filter on the site, so a
 * link to the gauntlets list is a link someone can send. Nothing here touches
 * the Brawlhalla API or the database — the library is a static module, which is
 * why this page can afford to be the one place on the site that ships video.
 */
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ weapon?: string }>
}) {
  const sp = await searchParams
  const weapon: WeaponId = isWeapon(sp.weapon) ? sp.weapon : WEAPONS[0]
  const combos = combosFor(weapon)
  const total = totalCombos()

  return (
    <main className="pb-16">
      <PageHero
        title="The Lab"
        subtitle="True combos — the strings that cannot be escaped once the first hit lands. Pick a weapon."
        meta={
          <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-tier-valhallan uppercase">
            {total === 0
              ? "Filling up"
              : `${total} clip${total === 1 ? "" : "s"}`}
          </span>
        }
      />

      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-[1280px]">
          {/* Icons, not names. Fifteen weapon names in a row is a wall of text
              you read; fifteen icons is a shelf you point at, and the icon is
              how the weapon is identified everywhere else on the site. */}
          <nav
            aria-label="Weapon"
            className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1"
          >
            {WEAPONS.map((w) => {
              const active = w === weapon
              const n = combosFor(w).length
              return (
                <Link
                  key={w}
                  href={`/lab?weapon=${w}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  title={`${WEAPON_NAMES[w]}${n > 0 ? ` — ${n} clips` : ""}`}
                  className={cn(
                    "group/w relative flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                    active
                      ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <WeaponIcon weaponId={w} size={24} />
                  <span
                    className={cn(
                      "font-mono text-xs tracking-wider uppercase",
                      // The name only on the active one: it names what you are
                      // looking at without making the other fourteen shout.
                      active ? "inline" : "hidden xl:inline"
                    )}
                  >
                    {WEAPON_NAMES[w]}
                  </span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-6">
            {combos.length === 0 ? (
              <Empty weapon={weapon} />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {combos.map((c) => (
                  <ComboCard key={c.id} combo={c} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/**
 * One clip.
 *
 * Muted, looping and autoplaying, because a true combo is two seconds long and
 * a play button on a two-second clip is a click to see the thing you came for.
 * `controls` stays on so it can be scrubbed and paused, and `preload="metadata"`
 * keeps a grid of them from pulling every file on load.
 */
function ComboCard({ combo }: { combo: TrueCombo }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm">
      <video
        src={combo.src}
        poster={combo.poster}
        controls
        loop
        muted
        autoPlay
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black/40 object-contain"
      />
      <div className="flex flex-col gap-1 p-3">
        <span className="font-mono text-sm font-medium">{combo.notation}</span>
        {combo.note && (
          <span className="text-xs text-muted-foreground">{combo.note}</span>
        )}
      </div>
    </li>
  )
}

/**
 * The empty state names the weapon and says what is missing, rather than
 * apologising. Every weapon is in this state today — the library ships empty on
 * purpose, because a combo is a game fact and inventing notation would put a
 * guess on the one page whose promise is that these strings are true.
 */
function Empty({ weapon }: { weapon: WeaponId }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
      <WeaponIcon weaponId={weapon} size={48} className="opacity-40" />
      <p className="font-display text-lg font-semibold">
        No {WEAPON_NAMES[weapon]} clips yet
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        The Lab is being filled one weapon at a time. Every clip here is a
        recorded true combo — nothing gets written down until it has been landed
        on camera.
      </p>
    </div>
  )
}
