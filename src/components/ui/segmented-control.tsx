"use client"

import type { ComponentType } from "react"
import { cn } from "@/lib/utils"

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ComponentType<{ className?: string }>
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
  size?: "sm" | "default"
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  size = "default"
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "inline-grid rounded-md border bg-muted/35 p-0.5",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {options.map((option) => {
        const Icon = option.icon
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-2 font-medium transition-colors",
              size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onValueChange(option.value)}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
