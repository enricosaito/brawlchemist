"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { BadgeCheck, Loader2 } from "lucide-react"
import { startClaimAction, verifyClaimAction } from "@/app/claim/actions"

const START_ERRORS: Record<string, string> = {
  "bad-id": "Enter a valid Brawlhalla ID (a positive number).",
  "no-data":
    "We don't have ranked data for that player yet. Open their profile page once to load it, then try again.",
  "not-eligible":
    "This account doesn't have enough ranked games across legends for us to verify it.",
  "already-claimed": "This profile is already claimed by another account.",
  "owns-another": "Your account already owns a different profile.",
  "rate-limited": "Too many attempts. Please try again in 24 hours.",
  unauthenticated: "Your session expired — please sign in again.",
}

const VERIFY_ERRORS: Record<string, string> = {
  expired: "That challenge expired. Start again to get a fresh one.",
  "not-found": "That challenge is no longer active. Start again.",
  "rate-limited": "Too many attempts. Please try again in 24 hours.",
  "already-claimed": "This profile was just claimed by another account.",
  "owns-another": "Your account already owns a different profile.",
  unauthenticated: "Your session expired — please sign in again.",
}

type Step =
  | { kind: "id" }
  | { kind: "question"; claimId: string; legendName: string; username: string }
  | { kind: "done"; username: string }

export function ClaimWizard({ initialId }: { initialId?: string }) {
  const [bhId, setBhId] = useState(initialId ?? "")
  const [answer, setAnswer] = useState("")
  const [step, setStep] = useState<Step>({ kind: "id" })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onStart(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await startClaimAction(bhId)
      if (res.ok) {
        setAnswer("")
        setStep({
          kind: "question",
          claimId: res.claimId,
          legendName: res.legendName,
          username: res.username,
        })
      } else {
        setError(START_ERRORS[res.reason] ?? "Something went wrong.")
      }
    })
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault()
    if (step.kind !== "question") return
    setError(null)
    const claimId = step.claimId
    const username = step.username
    start(async () => {
      const res = await verifyClaimAction(claimId, answer)
      if (res.ok) {
        setStep({ kind: "done", username })
      } else if (res.reason === "wrong") {
        setAnswer("")
        setError(
          `Not quite${
            res.remainingAttempts != null
              ? ` — ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`
              : ""
          }.`,
        )
      } else {
        // Hard stop — bounce back to the id step so the user can restart.
        setError(VERIFY_ERRORS[res.reason] ?? "Something went wrong.")
        if (res.reason !== "rate-limited") setStep({ kind: "id" })
      }
    })
  }

  if (step.kind === "done") {
    return (
      <div className="rounded-2xl border border-positive/40 bg-positive/10 p-6 text-center">
        <BadgeCheck className="mx-auto size-8 text-positive" />
        <h2 className="mt-3 font-display text-lg font-semibold">
          You&apos;re verified
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {step.username} is now linked to your account.
        </p>
        <Link
          href={`/player/${encodeURIComponent(bhId)}`}
          className="mt-4 inline-block rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
        >
          View your profile
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
      {step.kind === "id" ? (
        <form onSubmit={onStart}>
          <h1 className="font-display text-xl font-semibold">
            Claim your profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your Brawlhalla ID. You&apos;ll find it in the URL of your
            profile page — <span className="font-mono">/player/123456</span>.
          </p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            required
            autoFocus
            value={bhId}
            onChange={(e) => setBhId(e.target.value)}
            placeholder="Brawlhalla ID"
            className="mt-4 w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-copper"
          />
          {error && <ErrorLine>{error}</ErrorLine>}
          <SubmitButton pending={pending}>Continue</SubmitButton>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <h1 className="font-display text-xl font-semibold">
            Prove it&apos;s you
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifying <span className="font-semibold text-foreground">{step.username}</span>.
            What is your current ranked rating on{" "}
            <span className="font-semibold text-foreground">{step.legendName}</span>{" "}
            this season?
          </p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            required
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={`${step.legendName} ranked rating`}
            className="mt-4 w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-copper"
          />
          {error && <ErrorLine>{error}</ErrorLine>}
          <SubmitButton pending={pending}>Verify</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setStep({ kind: "id" })
            }}
            className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Use a different ID
          </button>
        </form>
      )}
    </div>
  )
}

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-copper px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-negative">
      {children}
    </p>
  )
}
