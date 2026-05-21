export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/60 bg-background/60">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm text-copper" aria-hidden>
            ⚗
          </span>
          <span>
            Brawlchemist — fan-made stats. Not affiliated with or endorsed by
            Blue Mammoth Games.
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider">
          <span>API: live</span>
          <a
            href="https://github.com/enricosaito/brawlchemist"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-copper"
          >
            GitHub
          </a>
          <a
            href="https://discord.gg/jXpe8kjYwQ"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-copper"
          >
            Discord
          </a>
        </div>
      </div>
    </footer>
  )
}
