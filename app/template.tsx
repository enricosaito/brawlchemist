/**
 * Root template — remounts on every route navigation (unlike layout), which
 * re-triggers the page-enter animation: a subtle fade-in + upward jump for
 * each page (leaderboards, queue, legends, …). Query-string-only changes
 * (filters, pagination) don't remount, so they don't re-animate.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>
}
