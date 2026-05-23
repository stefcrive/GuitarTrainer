'use client'

import { Button } from '@/components/ui/button'
import type { AudioMarker } from '@/types/audio'
import { cn } from '@/lib/utils'

interface MarkerTimeEditorProps {
  marker: AudioMarker
  maxDuration: number
  audioControls: {
    getCurrentTime: () => number
    getDuration: () => number
    seek: (time: number) => void
    play: () => void
  }
  onSave: (marker: AudioMarker, closeEditor?: boolean) => void
  className?: string
}

export function MarkerTimeEditor({
  marker,
  maxDuration,
  audioControls,
  onSave,
  className
}: MarkerTimeEditorProps) {
  const handleTimeInputChange = (field: 'startTime' | 'endTime', value: string) => {
    const time = parseTimeInput(value)
    if (time === null || time < 0 || time > maxDuration) return

    onSave(
      { ...marker, [field]: time, completionDegree: marker.completionDegree || 0 },
      false
    )
  }

  const setMarkerTimeToCurrent = (field: 'startTime' | 'endTime') => {
    const currentTime = roundToMilliseconds(audioControls.getCurrentTime())
    onSave(
      { ...marker, [field]: currentTime, completionDegree: marker.completionDegree || 0 },
      false
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Start time */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={formatTime(marker.startTime)}
          onChange={(e) => handleTimeInputChange('startTime', e.target.value)}
          className="w-24 rounded-md border border-input/80 bg-gradient-to-b from-white to-muted/20 px-2 py-1 text-sm shadow-sm transition-[border-color,box-shadow] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:from-input/80 dark:to-input/40"
          placeholder="00:00.000"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMarkerTimeToCurrent('startTime')}
        >
          Set to Current
        </Button>
      </div>

      {/* End time */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={formatTime(marker.endTime)}
          onChange={(e) => handleTimeInputChange('endTime', e.target.value)}
          className="w-24 rounded-md border border-input/80 bg-gradient-to-b from-white to-muted/20 px-2 py-1 text-sm shadow-sm transition-[border-color,box-shadow] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:from-input/80 dark:to-input/40"
          placeholder="00:00.000"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMarkerTimeToCurrent('endTime')}
        >
          Set to Current
        </Button>
      </div>
    </div>
  )
}

function roundToMilliseconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

function parseTimeInput(value: string): number | null {
  const [minutesText, secondsText] = value.trim().split(':')
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
  return roundToMilliseconds(minutes * 60 + seconds)
}

// Helper function to format time in MM:SS.mmm
function formatTime(seconds: number): string {
  const totalMilliseconds = Math.round(seconds * 1000)
  const mins = Math.floor(totalMilliseconds / 60000)
  const secs = Math.floor((totalMilliseconds % 60000) / 1000)
  const millis = totalMilliseconds % 1000

  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}
