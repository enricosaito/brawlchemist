import { InfoTip } from "./info-tip"

/**
 * A player's championship titles, newest first, capped.
 *
 * Titles used to be a handful an operator typed by hand. Now that they are
 * derived from Challengermode placements a competitive player carries nine or
 * ten, and an unbounded row of gold tags wrapped to three lines and pushed the
 * rest of the header down — the accolades stopped reading as accolades and
 * started reading as a paragraph.
 *
 * So: the five most recent, then one tag saying how many are left. The count is
 * a tooltip rather than a link, because the full list is the kind of thing you
 * check once and never navigate to.
 */

const CAP = 5

/**
 * Within a year, the order the season actually ran.
 *
 * Midseason and World sit last because they are the year's peaks rather than a
 * fifth season — a player who won Winter and then Worlds should lead with
 * Worlds.
 */
const SEASON_RANK: Record<string, number> = {
  winter: 1,
  spring: 2,
  summer: 3,
  autumn: 4,
  midseason: 5,
  world: 6,
}

/**
 * Sort key parsed from the rendered string rather than carried alongside it.
 *
 * Both halves of the merged list are plain strings by the time they reach a
 * component — curated titles are free text an operator typed, and threading a
 * structured record through `PlayerPreview` for the sake of ordering would make
 * every surface that renders a title care about the shape. The year is right
 * there in the text; anything without one sorts last and keeps its order.
 */
function rank(title: string): [number, number] {
  const year = /'(\d{2})\b/.exec(title)
  const season = Object.keys(SEASON_RANK).find((s) =>
    title.toLowerCase().includes(s)
  )
  return [year ? Number(year[1]) : -1, season ? SEASON_RANK[season] : 0]
}

export function sortTitlesByRecency(titles: string[]): string[] {
  return [...titles].sort((a, b) => {
    const [ay, as] = rank(a)
    const [by, bs] = rank(b)
    return by - ay || bs - as
  })
}

export function EsportsTitles({ titles }: { titles: string[] }) {
  if (titles.length === 0) return null
  const ordered = sortTitlesByRecency(titles)
  const shown = ordered.slice(0, CAP)
  const rest = ordered.slice(CAP)

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider">
      {shown.map((title) => (
        <span
          key={title}
          className="inline-flex items-center rounded-md border border-tier-gold/40 bg-tier-gold/10 px-1.5 py-0.5 text-tier-gold"
        >
          {title}
        </span>
      ))}
      {rest.length > 0 && (
        <InfoTip
          label={
            <span className="flex flex-col gap-0.5 text-left">
              {rest.map((title) => (
                <span key={title}>{title}</span>
              ))}
            </span>
          }
        >
          {/* Muted, not gold: it is a count of accolades, not one of them. */}
          <span className="inline-flex items-center rounded-md border border-border/60 bg-card/40 px-1.5 py-0.5 text-muted-foreground">
            +{rest.length}
          </span>
        </InfoTip>
      )}
    </div>
  )
}
