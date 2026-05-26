export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/60 bg-background/60">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="max-w-[640px]">
          <span className="block">
            Brawlchemist — tracking real live data from the official Brawlhalla
            Developer API.
          </span>
          <span className="block">
            Not affiliated with or endorsed by Blue Mammoth Games.
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider">
          <a
            href="/github"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-tier-valhallan"
          >
            GitHub
          </a>
          <a
            href="/twitter"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-tier-valhallan"
          >
            Twitter
          </a>
          <a
            href="/discord"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-tier-valhallan"
          >
            Discord
          </a>
        </div>
      </div>
    </footer>
  )
}
