"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Star, UserRound } from "lucide-react"
import { signOutAction } from "@/app/auth/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { SessionUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { InfoTip } from "../info-tip"
import { FlairMark } from "../flair-mark"
import type { FlairContext } from "@/lib/profile/flair"
import type { VerifiedKind } from "@/lib/profile/verified"
import { VerifiedMark } from "@/components/site/verified-mark"

/** The Brawlhalla identity linked to the account, if claimed. */
export interface ClaimedProfile {
  id: number
  /** Pro handle when verified, otherwise the in-game username. */
  name: string | null
  verifiedKind: VerifiedKind
}

// Shared glass + hover/active treatment, echoing the nav buttons (same font,
// hover, and selected effects) at the account control's own smaller size.
const NAV_LOOK =
  "group flex items-center gap-3 rounded-2xl border border-white/10 bg-card/30 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground"

/**
 * Account control for the launcher rail/drawer. Signed-out: a "Sign in" link
 * carrying the current path as `next`. Signed-in: avatar + the user's claimed
 * Brawlhalla identity (pro handle / username, falling back to the Discord name
 * until a profile is linked), linking to their own profile, plus a sign-out
 * button. Styled to share the nav buttons' font, hover, and selected effects.
 */
export function AccountControl({
  user,
  claimed,
  flair,
  flairId,
}: {
  user: SessionUser | null
  claimed: ClaimedProfile | null
  /**
   * What this account has earned. Passed in rather than derived here: the
   * Developer flair comes from the account role, which only the server can
   * read, and this is a client component.
   */
  flair?: FlairContext
  /**
   * Their stored flair choice, so this runs the same resolution as every other
   * surface. Without it the account button would pick the rarest earned badge
   * while the profile flew the one they actually chose.
   */
  flairId?: string | null
}) {
  const pathname = usePathname() ?? "/"

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        data-active={pathname.startsWith("/login")}
        className={NAV_LOOK}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-muted/40">
          <UserRound className="size-4" />
        </span>
        Sign in
      </Link>
    )
  }

  // Prefer the claimed Brawlhalla identity; fall back to the Discord display
  // name (or email) until a profile is linked.
  const label = claimed?.name ?? user.name ?? user.email ?? "Account"
  const profileHref = claimed ? `/player/${claimed.id}` : "/account"
  const active = claimed
    ? pathname.startsWith(`/player/${claimed.id}`) ||
      pathname.startsWith("/account")
    : pathname.startsWith("/account")

  return (
    <div className="flex items-stretch gap-2">
      <Link
        href={profileHref}
        data-active={active}
        title={claimed ? "Your profile" : "Your account"}
        className={cn(NAV_LOOK, "min-w-0 flex-1")}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Discord CDN host, no optimizer needed
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pink/20 text-sm font-semibold text-foreground">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate normal-case">{label}</span>
        <VerifiedMark tier={claimed?.verifiedKind ?? "none"} className="size-4" />
        {/* The one they fly, same as everywhere else. This used to show the
            whole earned set on the theory that your own account is a "what have
            I got" question — but a developer with a linked profile then wore two
            badges here and one everywhere else, and a flair that means "the
            badge you chose" cannot also sometimes mean "all of them". */}
        {flair && <FlairMark selectedId={flairId} context={flair} className="h-4" />}
      </Link>
      <InfoTip label="Favorites">
      <Link
        href="/favorites"
        data-active={pathname.startsWith("/favorites")}
        aria-label="Favorites"
        className="flex w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground"
      >
        <Star className="size-4" />
      </Link>
      </InfoTip>
{/* Confirm before signing out. The button is a 40px icon wedged between
          two other 40px icons — one of which is the link to your own profile —
          so the cost of a misfire is high and the cost of a click is nothing.
          Signing back in is a round trip through email or Discord, which is a
          long way back from a slip of the cursor.

          The dialog wraps the form rather than the form wrapping the dialog:
          Radix portals the content to the end of the body, and a <form> that
          has been portalled away no longer submits with the button inside it. */}
      <AlertDialog>
        <InfoTip label="Sign out">
          <AlertDialogTrigger
            aria-label="Sign out"
            className="flex w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground"
          >
            <LogOut className="size-4" />
          </AlertDialogTrigger>
        </InfoTip>
        <AlertDialogContent>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll need to sign in again to reach your profile, favorites
            and customization. Nothing is deleted.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <form action={signOutAction}>
              {/* Back where they were, which is what the old form did too. */}
              <input type="hidden" name="next" value={pathname} />
              <AlertDialogAction type="submit">Sign out</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
