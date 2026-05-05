import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface MediaListRowProps {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
  media?: ReactNode
  meta?: ReactNode
  selected?: boolean
  favorite?: boolean
  onClick?: () => void
  action?: ReactNode
  className?: string
}

export function MediaListRow({
  icon: Icon,
  title,
  description,
  media,
  meta,
  selected,
  favorite,
  onClick,
  action,
  className
}: MediaListRowProps) {
  const content = (
    <>
      {media}
      {Icon && !media && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1 text-left">
        <div className="min-w-0 truncate text-sm font-medium">{title}</div>
        {description && <div className="truncate text-xs text-muted-foreground">{description}</div>}
        {meta && <div className="mt-1 flex min-w-0 flex-wrap gap-1.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
    </>
  )

  return (
    <div
      className={cn(
        "group flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors",
        selected ? "border-border bg-accent text-accent-foreground" : "hover:bg-muted/60",
        favorite && !selected && "border-l-2 border-l-amber-500 bg-amber-500/5",
        className
      )}
    >
      {onClick ? (
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
