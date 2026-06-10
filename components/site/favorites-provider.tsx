"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { toggleFavoriteAction } from "@/app/favorites/actions"

/**
 * Client-side favorites state, seeded once from the server at the app shell and
 * shared by every surface that shows a star (profile header, /favorites list,
 * the leaderboard right-click menu). One source of truth means starring a player
 * in one place updates the star everywhere instantly — no per-surface round
 * trips, no drift.
 *
 * Optimistic: `toggle` flips local state immediately, calls the server action,
 * and reverts on failure / at-cap. On success it re-syncs server-rendered
 * surfaces via router.refresh(). Used outside a provider it degrades to a
 * logged-out no-op, so components stay safe anywhere.
 */

export interface ToggleOutcome {
  ok: boolean
  favorited?: boolean
  atCap?: boolean
  error?: "auth" | "save"
}

interface FavoritesContextValue {
  loggedIn: boolean
  isFavorite: (id: number) => boolean
  toggle: (id: number) => Promise<ToggleOutcome>
  count: number
}

const FavoritesContext = createContext<FavoritesContextValue>({
  loggedIn: false,
  isFavorite: () => false,
  toggle: async () => ({ ok: false, error: "auth" }),
  count: 0,
})

export function useFavorites(): FavoritesContextValue {
  return useContext(FavoritesContext)
}

export function FavoritesProvider({
  initialIds,
  loggedIn,
  children,
}: {
  initialIds: number[]
  loggedIn: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [ids, setIds] = useState<Set<number>>(() => new Set(initialIds))

  const isFavorite = useCallback((id: number) => ids.has(id), [ids])

  const toggle = useCallback(
    async (id: number): Promise<ToggleOutcome> => {
      if (!loggedIn) return { ok: false, error: "auth" }
      const had = ids.has(id)
      // Optimistic flip.
      setIds((prev) => {
        const n = new Set(prev)
        if (had) n.delete(id)
        else n.add(id)
        return n
      })

      const res = await toggleFavoriteAction(id)
      if (!res.ok || res.atCap) {
        // Revert to the pre-click state (a refused add, or a failed write).
        setIds((prev) => {
          const n = new Set(prev)
          if (had) n.add(id)
          else n.delete(id)
          return n
        })
        return res
      }

      // Settle to the server's truth. Stars everywhere read this context, so no
      // global refresh is needed — only the /favorites list is server-rendered
      // from the favorites, so refresh just that route (avoids re-rendering
      // heavy pages like the leaderboard on a star toggle).
      setIds((prev) => {
        const n = new Set(prev)
        if (res.favorited) n.add(id)
        else n.delete(id)
        return n
      })
      if (pathname?.startsWith("/favorites")) router.refresh()
      return res
    },
    [ids, loggedIn, pathname, router],
  )

  const value = useMemo(
    () => ({ loggedIn, isFavorite, toggle, count: ids.size }),
    [loggedIn, isFavorite, toggle, ids],
  )

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}
