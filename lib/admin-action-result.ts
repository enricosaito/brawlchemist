/**
 * What an admin form action hands back to the form that submitted it.
 *
 * A plain module on purpose: it is imported by server actions and by the
 * client `ActionForm` that renders their outcome, and a `"use client"` module
 * cannot export a value to the server side without becoming a proxy (see the
 * /meta-picks note in CLAUDE.md). Keeping it here keeps it a type.
 *
 * `null` is the initial state — nothing submitted yet. After that it is always
 * a verdict with a sentence attached, because "nothing happened" is the worst
 * possible answer on a panel.
 */
export type ActionResult =
  | {
      ok: true
      message: string
      /**
       * Where the form should go once it has shown the verdict.
       *
       * Only for a write that *creates* something, where staying put would
       * leave the operator on a form for a row that now exists elsewhere —
       * adding a pro is the case. An edit sets nothing and stays where it is,
       * because `revalidatePath` already re-rendered the page underneath it.
       */
      href?: string
    }
  | { ok: false; message: string }
  | null
