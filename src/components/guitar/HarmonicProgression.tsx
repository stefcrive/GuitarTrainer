"use client"

import { getScaleProgression, getModeNumberFromName } from "@/data/scale-progressions"
import { Scale } from "@/types/guitar"
import { cn } from "@/lib/utils"

type HarmonicProgressionProps = {
  selectedScale: Scale | null
  className?: string
}

export function HarmonicProgression({ selectedScale, className }: HarmonicProgressionProps) {
  if (!selectedScale?.parentScale) return null

  const progression = getScaleProgression(selectedScale.parentScale)
  if (!progression) return null

  const selectedModeNumber = getModeNumberFromName(selectedScale.name)

  return (
    <div className={cn("py-4 space-y-2", className)}>
      <h3 className="text-sm font-medium">
        {selectedScale.parentScale} Scale Harmonic Progression
      </h3>
      <div className="flex gap-4 items-center">
        {progression.progression.map((chord, index) => (
          <div
            key={index}
            className={cn(
              "px-3 py-2 rounded-md text-center transition-colors",
              chord.modeNumber === selectedModeNumber
                ? "bg-primary text-primary-foreground scale-110 shadow-md"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <div className="text-lg font-medium">{chord.name}</div>
            <div className={cn(
              "text-xs",
              chord.modeNumber === selectedModeNumber
                ? "text-primary-foreground/80"
                : "text-muted-foreground"
            )}>
              {chord.type}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}