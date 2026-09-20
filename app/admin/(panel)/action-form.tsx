"use client"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Loader2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActionResult } from "@/lib/admin-action-result"

/**
 * A form that stays alive while its action runs.
 *
 * Every admin mutation used to be a bare `<form action={serverAction}>` whose
 * action ended in `redirect()`. That is three problems in one shape:
 *
 *  - the browser gives no feedback between the click and the new document,
 *    which on a cross-region database is a second or more of "did that work";
 *  - the redirect re-renders the whole page, and because the action just
 *    busted the profiles cache, that render always misses it — so a one-row
 *    write cost ~seven round trips before the operator saw anything;
 *  - nothing was disabled, so a second click during the wait sent the write
 *    again.
 *
 * Here the action returns a verdict instead of redirecting. The submit button
 * disables itself and shows a spinner for exactly as long as the action runs
 * (`useFormStatus`), and the verdict renders inline beside it. The action ends
 * in `revalidatePath("/admin")`, so its own response carries the re-rendered
 * server components — the table updates in the same round trip, under an
 * interface that never stopped responding, with no `router.refresh()` (which
 * would be a second full render of the panel).
 *
 * `confirm` turns the submit into a two-step: the first click arms it and the
 * button changes its label, the second sends. Deliberate without a dialog, and
 * it disarms itself if you look away, so an armed Delete never lies in wait.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  confirm,
  className,
  submitClassName,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  children?: React.ReactNode
  submitLabel: string
  /** Label for the armed state; presence turns on the two-step. */
  confirm?: string
  className?: string
  submitClassName?: string
}) {
  const [result, formAction] = useActionState(action, null)
  const [armed, setArmed] = useState(false)

  // An armed control disarms itself if you look away.
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 6000)
    return () => window.clearTimeout(t)
  }, [armed])

  return (
    <form
      action={formAction}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      onSubmit={(e) => {
        if (!confirm) return
        if (armed) {
          // Second click: let it send, and stand down.
          setArmed(false)
          return
        }
        e.preventDefault()
        setArmed(true)
      }}
    >
      {children}
      <Submit
        label={armed && confirm ? confirm : submitLabel}
        armed={armed}
        className={submitClassName}
      />
      {result && <Verdict result={result} />}
    </form>
  )
}

function Submit({
  label,
  armed,
  className,
}: {
  label: string
  armed: boolean
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider uppercase transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60",
        armed &&
          "border-negative/60 bg-negative/15 text-negative hover:bg-negative/25",
        className
      )}
    >
      {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {label}
    </button>
  )
}

/**
 * The outcome, where the click was. Success is quiet and fades; failure stays
 * until the next attempt, because the operator has to read it to fix it.
 */
function Verdict({ result }: { result: NonNullable<ActionResult> }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] tracking-wider",
        result.ok ? "text-positive" : "text-negative"
      )}
    >
      {result.ok ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <TriangleAlert className="size-3" aria-hidden />
      )}
      {result.message}
    </span>
  )
}
