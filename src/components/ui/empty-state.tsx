import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex h-full min-h-48 flex-col items-center justify-center gap-3 px-4 py-8 text-center", className)}>
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/35">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {action}
    </div>
  )
}
