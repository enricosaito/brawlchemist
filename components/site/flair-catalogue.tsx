"use client"

import { createContext, useContext } from "react"
import { BUILTIN_FLAIRS, type FlairDef } from "@/lib/profile/flair"

/**
 * The flair catalogue, available to client components.
 *
 * Flair renders from both sides of the boundary — server pages draw it on
 * leaderboard rows and podiums, client components draw it in the two search
 * dropdowns and the account button — so `FlairMark` has to work in either. That
 * was free while the catalogue was a code constant it could import. Now that an
 * operator curates it in Postgres, the client needs it handed over.
 *
 * One provider at the root layout rather than a prop threaded through thirteen
 * call sites: the catalogue is ambient, identical for every badge on the page,
 * and about a kilobyte of RSC payload once. Threading it would have meant
 * changing every surface that renders a name.
 *
 * Absent provider falls back to the built-in pair, so nothing here is *required*
 * to be wrapped and an error boundary above it costs nothing (cardinal
 * constraint #5).
 */
const Ctx = createContext<FlairDef[] | null>(null)

export function FlairCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: FlairDef[]
  children: React.ReactNode
}) {
  return <Ctx.Provider value={catalogue}>{children}</Ctx.Provider>
}

export function useFlairCatalogue(): FlairDef[] {
  return useContext(Ctx) ?? BUILTIN_FLAIRS
}
