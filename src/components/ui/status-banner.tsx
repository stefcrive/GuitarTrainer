import type { ComponentType, ReactNode } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

type StatusTone = "info" | "success" | "warning" | "destructive"

const toneClasses: Record<StatusTone, string> = {
  info: "border-border bg-muted/35 text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  destructive: "border-destructive/35 bg-destructive/10 text-destructive"
}

const toneIcons: Record<StatusTone, ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: AlertCircle
}

interface StatusBannerProps {
  children: ReactNode
  tone?: StatusTone
  className?: string
}

export function StatusBanner({ children, tone = "info", className }: StatusBannerProps) {
  const Icon = toneIcons[tone]
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", toneClasses[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
