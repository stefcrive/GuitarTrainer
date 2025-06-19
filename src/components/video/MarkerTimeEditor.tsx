'use client'

import { Button } from '@/components/ui/button'
import type { TimeMarker } from '@/types/video'
import { cn } from '@/lib/utils'

interface MarkerTimeEditorProps {
  marker: TimeMarker
  maxDuration: number
  videoControls: {
    getCurrentTime: () => number
    getDuration: () => number
    seek: (time: number) => void
    play: () => void
  }
  onSave: (marker: TimeMarker, closeEditor?: boolean) => void
  className?: string
}

export function MarkerTimeEditor({
  marker,
  maxDuration,
  videoControls,
  onSave,
  className
}: MarkerTimeEditorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Start time */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={formatTime(marker.startTime)}
          onChange={(e) => {
            const [minutes, seconds] = e.target.value.split(':').map(Number)
            if (isNaN(minutes) || isNaN(seconds)) return
            const time = minutes * 60 + seconds
            if (time < 0 || time > maxDuration) return
            onSave(
              { ...marker, startTime: time, completionDegree: marker.completionDegree || 0 },
              false
            )
          }}
          className="w-16 text-sm border rounded px-2 py-1"
          placeholder="00:00"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const currentTime = videoControls.getCurrentTime()
            onSave(
              { ...marker, startTime: currentTime, completionDegree: marker.completionDegree || 0 },
              false
            )
          }}
        >
          Set to Current
        </Button>
      </div>

      {/* End time */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={formatTime(marker.endTime)}
          onChange={(e) => {
            const [minutes, seconds] = e.target.value.split(':').map(Number)
            if (isNaN(minutes) || isNaN(seconds)) return
            const time = minutes * 60 + seconds
            if (time < 0 || time > maxDuration) return
            onSave(
              { ...marker, endTime: time, completionDegree: marker.completionDegree || 0 },
              false
            )
          }}
          className="w-16 text-sm border rounded px-2 py-1"
          placeholder="00:00"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const currentTime = videoControls.getCurrentTime()
            onSave(
              { ...marker, endTime: currentTime, completionDegree: marker.completionDegree || 0 },
              false
            )
          }}
        >
          Set to Current
        </Button>
      </div>
    </div>
  )
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}