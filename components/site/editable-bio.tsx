"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Pencil, Plus, Settings2, X } from "lucide-react"
import { saveBioAction } from "@/app/account/actions"
import { cn } from "@/lib/utils"

// Mirrors the server-side cap in normalizeInput (lib/sync/customizations.ts).
const BIO_MAX = 280

/**
 * Owner-only inline bio editor on the public profile Overview. Shows the bio
 * with a pencil affordance (or an "Add a bio" prompt when empty); editing opens
 * a textarea that saves via saveBioAction without leaving the page. Only the
 * verified owner ever sees this — the server gate in saveBioAction is the real
 * authority; this is the UI half.
 */
export function EditableBio({
  brawlhallaId,
  initialBio,
}: {
  brawlhallaId: number
  initialBio: string | null
}) {
  const router = useRouter()
  const [bio, setBio] = useState(initialBio ?? "")
  const [draft, setDraft] = useState(initialBio ?? "")
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function open() {
    setDraft(bio)
    setError(null)
    setEditing(true)
    // Focus + place cursor at the end once the textarea mounts.
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
  }

  function save() {
    const next = draft.trim().slice(0, BIO_MAX)
    setError(null)
    startTransition(async () => {
      const res = await saveBioAction(brawlhallaId, next)
      if (res.ok) {
        setBio(next)
        setEditing(false)
        // Pull fresh server state so the SSR'd bio matches after navigation.
        router.refresh()
      } else {
        setError(
          res.error === "forbidden"
            ? "You can only edit your own profile."
            : res.error === "auth"
              ? "Please sign in again."
              : "Couldn't save. Try again.",
        )
      }
    })
  }

  if (editing) {
    const remaining = BIO_MAX - draft.length
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={draft}
          maxLength={BIO_MAX}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a short bio — your mains, your story, where to find you…"
          className="w-full resize-none rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-copper"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false)
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save()
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Check className="size-3.5" />
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            <X className="size-3.5" />
            Cancel
          </button>
          <span
            className={cn(
              "ml-auto font-mono text-[10px] tabular-nums",
              remaining <= 20 ? "text-negative" : "text-muted-foreground",
            )}
          >
            {remaining}
          </span>
        </div>
        {error && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-negative">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (!bio) {
    return (
      <button
        type="button"
        onClick={open}
        className="group flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-copper/60 hover:text-foreground"
      >
        <Plus className="size-4 shrink-0 text-copper" />
        Add a bio
      </button>
    )
  }

  return (
    <div className="group/bio flex items-start gap-2">
      <p className="flex-1 text-sm leading-relaxed text-foreground/90">{bio}</p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={open}
          aria-label="Edit bio"
          title="Edit bio"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <a
          href="/account"
          aria-label="More profile options"
          title="More profile options"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </a>
      </div>
    </div>
  )
}
