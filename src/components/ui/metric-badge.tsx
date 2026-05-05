import type { ComponentType } from "react"
import { cn } from "@/lib/utils"

interface MetricBadgeProps {
  icon?: ComponentType<{ className?: string }>
  value: string | number
  label: string
  className?: string
}

export function MetricBadge({ icon: Icon, value, label, className }: MetricBadgeProps) {
  return (
    <div className={cn("inline-flex h-8 min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 text-xs", className)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className="font-medium tabular-nums">{value}</span>
      <span className="truncate text-muted-foreground">{label}</span>
    </div>
  )
}
