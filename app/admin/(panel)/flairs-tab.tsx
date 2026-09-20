import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  BUILTIN_FLAIRS,
  FLAIR_RULES,
  FLAIR_RULE_LABELS,
  type FlairRule,
} from "@/lib/profile/flair"
import {
  getFlairRecord,
  listFlairGrants,
  listFlairs,
  type FlairRecord,
} from "@/lib/sync/flairs"
import {
  deleteFlairAction,
  grantFlairAction,
  importBuiltinFlairsAction,
  revokeFlairAction,
  saveFlairAction,
} from "../actions"

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-pink"
const tagCls =
  "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
const actionCls =
  "font-mono text-[11px] uppercase tracking-wider transition-colors"
const buttonCls =
  "rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-muted"

/**
 * Manual is the one that needs a human afterwards, so it is the one that reads
 * differently. The rest run themselves.
 */
const RULE_CLASS: Record<FlairRule, string> = {
  developer: "border-pink/50 bg-pink/15 text-pink",
  claimed: "border-royal/40 bg-royal/10 text-royal",
  achievement: "border-tier-gold/40 bg-tier-gold/10 text-tier-gold",
  "pro-tier": "border-tier-gold/40 bg-tier-gold/10 text-tier-gold",
  manual: "border-mystic/40 bg-mystic/10 text-mystic",
}

/**
 * Admin → Flairs. The badge catalogue.
 *
 * What an operator owns here is what a flair *is*: its art, its name, the line
 * that explains how to get it, and how rare it ranks. What they can't own is
 * who has earned it — that is derived on every render from the player's own
 * record, which is the property that makes a badge mean something. So the form
 * offers a choice between three rules the code knows how to evaluate rather
 * than a rule builder.
 *
 * Two of those rules run themselves. The third, Granted by hand, exists because
 * a badge invented today has no fact behind it to derive from — without it,
 * creating a flair would produce a row nobody could ever hold.
 */
export async function FlairsTab({ editId }: { editId: string | null }) {
  const [flairs, grants] = await Promise.all([listFlairs(), listFlairGrants()])
  const editing = editId ? await getFlairRecord(editId) : null
  const missingBuiltins = BUILTIN_FLAIRS.filter(
    (b) => !flairs.some((f) => f.id === b.id),
  )
  const manual = flairs.filter((f) => f.rule === "manual")
  const grantsByFlair = new Map<string, typeof grants>()
  for (const g of grants) {
    const list = grantsByFlair.get(g.flairId)
    if (list) list.push(g)
    else grantsByFlair.set(g.flairId, [g])
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            Flairs{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({flairs.length} · {grants.length} granted)
            </span>
          </h2>
        </div>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          The badge catalogue. You own what a flair looks like and how rare it
          ranks;{" "}
          <span className="font-medium text-foreground">
            who has earned one is derived on every render
          </span>{" "}
          and can&apos;t be set here — that&apos;s what keeps a badge worth
          having. Pick from the rules the site knows how to check, or use{" "}
          <span className="font-medium text-foreground">Granted by hand</span>{" "}
          and award it below.
        </p>

        {flairs.length === 0 && (
          <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4">
            <p className="text-sm text-muted-foreground">
              Nothing in the table yet, so the site is still rendering the two
              flairs that ship in code. Import them to make them editable —
              nothing changes for players either way.
            </p>
          </div>
        )}

        {missingBuiltins.length > 0 && (
          <form action={importBuiltinFlairsAction} className="mt-3">
            <button type="submit" className={buttonCls}>
              Import built-ins ({missingBuiltins.length})
            </button>
          </form>
        )}

        {flairs.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {flairs.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
              >
                {/* On the checkerboard the site never shows, because an
                    operator needs to see the transparency they uploaded. */}
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-[repeating-conic-gradient(oklch(1_0_0_/_0.06)_0%_25%,transparent_0%_50%)] bg-[length:10px_10px]">
                  <Image
                    src={f.src}
                    alt=""
                    width={f.width}
                    height={f.height}
                    unoptimized
                    className="h-6 w-auto object-contain"
                  />
                </span>
                <span className="font-medium">{f.label}</span>
                <span className={labelCls}>{f.id}</span>
                <span className={cn(tagCls, RULE_CLASS[f.rule])}>
                  {FLAIR_RULE_LABELS[f.rule]}
                  {f.ruleValue ? `: ${f.ruleValue}` : ""}
                  {f.rule === "manual"
                    ? ` · ${grantsByFlair.get(f.id)?.length ?? 0}`
                    : ""}
                </span>
                <span className={labelCls}>rank {f.sort}</span>
                <span className={labelCls}>
                  {f.width}×{f.height}
                </span>
                {!f.enabled && (
                  <span
                    className={cn(
                      tagCls,
                      "border-border/60 bg-muted/40 text-muted-foreground",
                    )}
                  >
                    Hidden
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  <Link
                    href={`/admin?tab=flairs&editflair=${f.id}`}
                    scroll={false}
                    className={cn(actionCls, "text-pink hover:text-pink/80")}
                  >
                    Edit
                  </Link>
                  <form action={deleteFlairAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      className={cn(
                        actionCls,
                        "text-muted-foreground hover:text-negative",
                      )}
                    >
                      Delete
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FlairForm key={editing?.id ?? "new"} editing={editing} />

      <section>
        <h2 className="font-display text-lg font-semibold">Granted by hand</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          The award ledger for flairs with no rule behind them. Granting also
          creates the player&apos;s profile row if they don&apos;t have one —
          without it the award would be recorded and never rendered.{" "}
          <span className="font-medium text-foreground">
            A grant is entitlement, not a selection:
          </span>{" "}
          the player still chooses whether to fly it.
        </p>

        {manual.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No hand-granted flairs in the catalogue — create one with the rule
            set to <span className="text-foreground">Granted by hand</span>.
          </p>
        ) : (
          <form
            action={grantFlairAction}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <label className="block">
              <span className={labelCls}>Brawlhalla ID</span>
              <input
                name="brawlhallaId"
                type="number"
                required
                min={1}
                className={cn(inputCls, "w-44")}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Flair</span>
              <select name="flairId" className={cn(inputCls, "w-56")}>
                {manual.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={cn(buttonCls, "mb-0.5")}>
              Grant
            </button>
          </form>
        )}

        {grants.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {grants.map((g) => (
              <li
                key={`${g.brawlhallaId}-${g.flairId}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5"
              >
                <Link
                  href={`/player/${g.brawlhallaId}`}
                  prefetch={false}
                  className="font-medium text-pink underline-offset-2 hover:underline"
                >
                  {g.username ?? `#${g.brawlhallaId}`}
                </Link>
                <span className={labelCls}>ID {g.brawlhallaId}</span>
                <span className={cn(tagCls, RULE_CLASS.manual)}>
                  {flairs.find((f) => f.id === g.flairId)?.label ?? g.flairId}
                </span>
                <form action={revokeFlairAction} className="ml-auto">
                  <input
                    type="hidden"
                    name="brawlhallaId"
                    value={g.brawlhallaId}
                  />
                  <input type="hidden" name="flairId" value={g.flairId} />
                  <button
                    type="submit"
                    className={cn(
                      actionCls,
                      "text-muted-foreground hover:text-negative",
                    )}
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * Create and edit are the same form: the fields are identical and the only
 * difference is whether the id is writable. Two forms would have been two
 * places to forget a field.
 */
function FlairForm({ editing }: { editing: FlairRecord | null }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {editing ? `Edit “${editing.label}”` : "New flair"}
        </h2>
        {editing && (
          <Link
            href="/admin?tab=flairs"
            scroll={false}
            className={cn(actionCls, "text-muted-foreground hover:text-foreground")}
          >
            Cancel
          </Link>
        )}
      </div>

      <form
        action={saveFlairAction}
        className="mt-4 grid gap-4 rounded-xl border border-border/60 bg-card/40 p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="mode" value={editing ? "edit" : "create"} />

        <label className="block">
          <span className={labelCls}>ID</span>
          <input
            name="id"
            defaultValue={editing?.id ?? ""}
            readOnly={!!editing}
            required
            placeholder="beta-tester"
            className={cn(inputCls, editing && "text-muted-foreground")}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {editing
              ? "Fixed — it's the value stored in every selection and grant."
              : "Lowercase slug. Spaces become dashes."}
          </span>
        </label>

        <label className="block">
          <span className={labelCls}>Label</span>
          <input
            name="label"
            defaultValue={editing?.label ?? ""}
            required
            placeholder="Beta Tester"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            The tooltip on every profile that flies it.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className={labelCls}>Requirement</span>
          <input
            name="requirement"
            defaultValue={editing?.requirement ?? ""}
            placeholder="Played during the closed beta"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Shown on the locked row in the player&apos;s picker — this is the
            only place anyone learns the badge exists.
          </span>
        </label>

        <label className="block">
          <span className={labelCls}>Rule</span>
          <select
            name="rule"
            defaultValue={editing?.rule ?? "manual"}
            className={inputCls}
          >
            {FLAIR_RULES.map((r) => (
              <option key={r} value={r}>
                {FLAIR_RULE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelCls}>Rule value</span>
          <input
            name="ruleValue"
            defaultValue={editing?.ruleValue ?? ""}
            placeholder="world champion"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            For <em>Accolade matches</em>, a case-insensitive substring of the
            titles on the People tab. For <em>Standing is</em>, a tier id —{" "}
            <span className="font-mono">top</span>,{" "}
            <span className="font-mono">pro</span> or{" "}
            <span className="font-mono">power-ranked</span>, matched exactly.
            Left blank, or not one of those, it fires for nobody.
          </span>
        </label>

        <label className="block">
          <span className={labelCls}>Rarity rank</span>
          <input
            name="sort"
            type="number"
            defaultValue={editing?.sort ?? 100}
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Lower is rarer. A player who hasn&apos;t chosen flies the lowest one
            they hold.
          </span>
        </label>

        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={editing ? editing.enabled : true}
            className="size-4 accent-pink"
          />
          <span className="text-sm">Visible</span>
          <span className="text-[11px] text-muted-foreground">
            Off retires it without destroying anyone&apos;s choice.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className={labelCls}>Upload art (PNG)</span>
          <input
            type="file"
            name="image"
            accept="image/png"
            className={cn(
              inputCls,
              "file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs",
            )}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Wins over the URL below, and fills in the dimensions from the PNG
            header. Keep it around 192px and under ~20 KB: flair is drawn at
            16-32px, served unoptimised, and appears on every row of a
            leaderboard — fifty copies of the file on one screen. Hard ceiling
            128 KB.
          </span>
        </label>

        {/* The URL is not just a fallback for a missing blob token: it is how
            you point at art that already ships in /public, which is where both
            built-ins live. */}
        <label className="block">
          <span className={labelCls}>…or art URL</span>
          <input
            name="src"
            defaultValue={editing?.src ?? ""}
            placeholder="/assets/badge.png"
            className={inputCls}
          />
        </label>

        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className={labelCls}>Width</span>
            <input
              name="width"
              type="number"
              min={1}
              defaultValue={editing?.width ?? ""}
              className={inputCls}
            />
          </label>
          <label className="block flex-1">
            <span className={labelCls}>Height</span>
            <input
              name="height"
              type="number"
              min={1}
              defaultValue={editing?.height ?? ""}
              className={inputCls}
            />
          </label>
          {editing && (
            <span className="mb-1 flex size-12 shrink-0 items-center justify-center rounded-md border border-border/60 bg-[repeating-conic-gradient(oklch(1_0_0_/_0.06)_0%_25%,transparent_0%_50%)] bg-[length:10px_10px]">
              <Image
                src={editing.src}
                alt=""
                width={editing.width}
                height={editing.height}
                unoptimized
                className="h-8 w-auto object-contain"
              />
            </span>
          )}
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className={buttonCls}>
            {editing ? "Save flair" : "Create flair"}
          </button>
        </div>
      </form>
    </section>
  )
}
