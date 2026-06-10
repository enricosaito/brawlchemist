"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ContextMenu } from "radix-ui"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFavorites } from "./favorites-provider"

/**
 * PlayerLink — wraps a player's name in a link to their profile, with a custom
 * right-click context menu (Copy ID / Open profile / Open in new tab). Falls
 * back to plain text when we don't have a Brawlhalla ID (e.g. mock rows), so
 * callers can use it unconditionally.
 *
 * `prefetch={false}` is deliberate: any list of player links (leaderboards,
 * OTPs, legends, home top players) would otherwise cascade into server renders
 * of each linked profile, firing loadRanked + recordFetch per row. Left-clicks
 * still navigate normally.
 */
export function PlayerLink({
  id,
  className,
  children,
}: {
  id: number | null | undefined
  className?: string
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? "/"
  const { loggedIn, selfId, isFavorite, toggle } = useFavorites()

  if (id == null) return <span className={className}>{children}</span>

  const fav = isFavorite(id)
  const isSelf = selfId === id

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(String(id)).catch(() => {
        // Clipboard write can fail in non-secure contexts or older browsers;
        // we deliberately swallow so right-click never throws.
      })
    }
  }

  const itemCls =
    "block cursor-pointer rounded px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-foreground outline-none transition-colors hover:bg-muted/60 focus:bg-muted/60 data-[highlighted]:bg-muted/60"

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <Link
          href={`/player/${id}`}
          prefetch={false}
          className={cn(
            "underline-offset-2 transition-colors hover:underline",
            className,
          )}
        >
          {children}
        </Link>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border/60 bg-card/95 p-1 shadow-lg backdrop-blur-sm">
          <ContextMenu.Item onSelect={handleCopyId} className={itemCls}>
            Copy ID{" "}
            <span className="text-muted-foreground">#{id}</span>
          </ContextMenu.Item>
          <ContextMenu.Item asChild>
            <Link href={`/player/${id}`} prefetch={false} className={itemCls}>
              Open profile
            </Link>
          </ContextMenu.Item>
          <ContextMenu.Item asChild>
            <Link
              href={`/player/${id}`}
              prefetch={false}
              target="_blank"
              rel="noopener"
              className={itemCls}
            >
              Open in new tab
            </Link>
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border/60" />
          {isSelf ? (
            <ContextMenu.Item
              disabled
              className={cn(itemCls, "flex items-center gap-1.5 opacity-50")}
            >
              <Star className="size-3 shrink-0" />
              Your profile
            </ContextMenu.Item>
          ) : loggedIn ? (
            <ContextMenu.Item
              onSelect={() => {
                void toggle(id)
              }}
              className={cn(itemCls, "flex items-center gap-1.5")}
            >
              <Star
                className={cn("size-3 shrink-0", fav && "fill-current text-tier-gold")}
              />
              {fav ? "Remove from Favorites" : "Add to Favorites"}
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Item asChild>
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                className={cn(itemCls, "flex items-center gap-1.5")}
              >
                <Star className="size-3 shrink-0" />
                Sign in to track
              </Link>
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
