import type { ComponentType, ReactNode } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface LibraryHeaderProps {
  title: string
  icon?: ComponentType<{ className?: string }>
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  controls?: ReactNode
  metrics?: ReactNode
  className?: string
}

export function LibraryHeader({
  title,
  icon: Icon,
  searchValue,
  searchPlaceholder = "Search...",
  onSearchChange,
  controls,
  metrics,
  className
}: LibraryHeaderProps) {
  return (
    <div className={cn("space-y-3 border-b bg-background/80 p-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <h2 className="truncate text-sm font-semibold">{title}</h2>
      </div>
      {onSearchChange && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
          />
        </div>
      )}
      {controls}
      {metrics && <div className="flex flex-wrap gap-2">{metrics}</div>}
    </div>
  )
}
