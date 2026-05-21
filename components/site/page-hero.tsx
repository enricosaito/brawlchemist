import { cn } from "@/lib/utils"

export function PageHero({
  title,
  subtitle,
  meta,
  className,
}: {
  title: string
  subtitle?: string
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "mx-auto max-w-[1280px] px-4 pt-10 pb-6 sm:px-6 sm:pt-14 sm:pb-8",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[0.02em] sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {meta && (
          <div className="flex flex-wrap items-center gap-2">{meta}</div>
        )}
      </div>
    </section>
  )
}
