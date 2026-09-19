import { Check, TriangleAlert, X } from "lucide-react"
import { gatherLinkCandidates, type LinkGrade } from "@/lib/sync/esports-link"
import { setCmPlayerIdAction } from "@/app/admin/actions"
import { cn } from "@/lib/utils"

/**
 * Which Challengermode competitor is which pro — the one link nothing can
 * derive, laid out so asserting it costs a click rather than ten lookups.
 *
 * 38 of 122 verified pros have no match history, and every one of them is a
 * profile that silently shows nothing. The cause is always the same: the bridge
 * maps `cmPlayerId -> brawlhalla_id`, and for these pros there is no way to get
 * from the account we curate to a Challengermode id.
 *
 * So this gathers the evidence instead of guessing at it. Each row shows the
 * three things that have to agree, side by side, and a grade for how well they
 * do. Nothing is written until someone presses a button — see the module note
 * in lib/sync/esports-link.ts for why an exact name match is strong evidence
 * and still not proof.
 *
 * The grade is the whole point of the layout: an exact row is a formality and
 * should read like one, and a weak row should look like the decision it is.
 */

const GRADE_TONE: Record<LinkGrade, string> = {
  exact: "border-positive/40 bg-positive/10 text-positive",
  near: "border-warning/40 bg-warning/10 text-warning",
  weak: "border-border/60 bg-muted/40 text-muted-foreground",
  none: "border-border/60 bg-muted/20 text-muted-foreground/60",
}

const GRADE_LABEL: Record<LinkGrade, string> = {
  exact: "Exact",
  near: "Near",
  weak: "Weak",
  none: "None",
}

const cellCls = "px-3 py-2 align-middle"
const headCls =
  "px-3 py-2 text-left font-mono text-[10px] tracking-wider text-muted-foreground uppercase"

export async function EsportsLinksTab() {
  const candidates = await gatherLinkCandidates()
  const counts = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = c.linked ? "linked" : c.grade
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Esports links</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A pro with no Challengermode id shows no match history, silently.
          Nothing in any API links a ladder account to a competitor, so this
          gathers the evidence and grades it — an exact match means the in-game
          name the player set on their own Challengermode account is the same
          one on the account curated here. That is strong evidence, not proof:
          Brawlhalla names are not unique, and a wrong link puts someone
          else&apos;s career on this profile.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["exact", "near", "weak", "none"] as LinkGrade[]).map((g) => (
            <span
              key={g}
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase",
                GRADE_TONE[g]
              )}
            >
              {GRADE_LABEL[g]} {counts[g] ?? 0}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded border border-mystic/40 bg-mystic/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-mystic uppercase">
            Linked {counts.linked ?? 0}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border/60">
            <tr>
              <th className={headCls}>Pro</th>
              <th className={headCls}>Our account name</th>
              <th className={headCls}>Challengermode name</th>
              <th className={headCls}>Competitor</th>
              <th className={headCls}>Grade</th>
              <th className={headCls}>Action</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.brawlhallaId}
                className="border-b border-border/40 last:border-0"
              >
                <td className={cn(cellCls, "font-medium whitespace-nowrap")}>
                  {c.handle}
                </td>
                {/* The two names that have to agree, adjacent on purpose —
                    comparing them is the entire decision. */}
                <td className={cn(cellCls, "font-mono text-xs")}>
                  {c.ourName ?? (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className={cn(cellCls, "font-mono text-xs")}>
                  {c.cmGameName ?? (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td
                  className={cn(
                    cellCls,
                    "font-mono text-xs text-muted-foreground"
                  )}
                >
                  {c.competitorName ?? (c.linked ? "already linked" : "—")}
                </td>
                <td className={cellCls}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase",
                      c.linked
                        ? "border-mystic/40 bg-mystic/10 text-mystic"
                        : GRADE_TONE[c.grade]
                    )}
                  >
                    {c.linked ? (
                      <>
                        <Check className="size-2.5" />
                        Linked
                      </>
                    ) : (
                      <>
                        {c.grade === "weak" && (
                          <TriangleAlert className="size-2.5" />
                        )}
                        {GRADE_LABEL[c.grade]}
                      </>
                    )}
                  </span>
                </td>
                <td className={cellCls}>
                  {c.linked ? (
                    <form action={setCmPlayerIdAction}>
                      <input
                        type="hidden"
                        name="brawlhallaId"
                        value={c.brawlhallaId}
                      />
                      <input type="hidden" name="cmPlayerId" value="" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase transition-colors hover:border-negative/50 hover:text-negative"
                      >
                        <X className="size-3" />
                        Unlink
                      </button>
                    </form>
                  ) : c.cmPlayerId ? (
                    <form action={setCmPlayerIdAction}>
                      <input
                        type="hidden"
                        name="brawlhallaId"
                        value={c.brawlhallaId}
                      />
                      <input
                        type="hidden"
                        name="cmPlayerId"
                        value={c.cmPlayerId}
                      />
                      <button
                        type="submit"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition-colors",
                          c.grade === "exact"
                            ? "border-positive/50 text-positive hover:bg-positive/10"
                            : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                        )}
                      >
                        <Check className="size-3" />
                        Confirm
                      </button>
                    </form>
                  ) : (
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
                      No candidate
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        After confirming, run{" "}
        <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-[11px]">
          node scripts/sync-esports-matches.mjs --resume
        </code>{" "}
        to pull their matches, then Refresh caches on the System tab.
      </p>
    </section>
  )
}
