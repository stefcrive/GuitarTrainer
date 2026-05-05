"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  label: string
  children: React.ReactElement
  side?: "top" | "bottom"
}

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {React.cloneElement(children, {
        "aria-label": children.props["aria-label"] ?? label,
        title: children.props.title ?? label,
      })}
      <span
        className={cn(
          "pointer-events-none absolute z-50 hidden max-w-48 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg group-hover/tooltip:block group-focus-within/tooltip:block",
          side === "top"
            ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
            : "left-1/2 top-full mt-2 -translate-x-1/2"
        )}
      >
        {label}
      </span>
    </span>
  )
}
