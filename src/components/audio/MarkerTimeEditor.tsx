'use client'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
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
  onSave: (marker: AudioMarker) => void
  onCancel: () => void
  className?: string
}

export function MarkerTimeEditor({
  marker,
  maxDuration,
  audioControls,
  onSave,
  onCancel,
  className
}: MarkerTimeEditorProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={formatTime(marker.startTime)}
              onChange={(e) => {
                const [minutes, seconds] = e.target.value.split(':').map(Number)
                if (isNaN(minutes) || isNaN(seconds)) return
                const time = minutes * 60 + seconds
                if (time < 0 || time > maxDuration) return
                onSave({ ...marker, startTime: time })
              }}
              className="w-16 text-sm border rounded px-2 py-1"
              placeholder="00:00"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentTime = audioControls.getCurrentTime()
                onSave({ ...marker, startTime: currentTime })
              }}
            >
              Set to Current
            </Button>
          </div>

          <div className="flex-1">
            <Slider
              value={[marker.startTime]}
              min={0}
              max={maxDuration}
              step={0.1}
              onValueChange={([value]) => onSave({ ...marker, startTime: value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={formatTime(marker.endTime)}
              onChange={(e) => {
                const [minutes, seconds] = e.target.value.split(':').map(Number)
                if (isNaN(minutes) || isNaN(seconds)) return
                const time = minutes * 60 + seconds
                if (time < 0 || time > maxDuration) return
                onSave({ ...marker, endTime: time })
              }}
              className="w-16 text-sm border rounded px-2 py-1"
              placeholder="00:00"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentTime = audioControls.getCurrentTime()
                onSave({ ...marker, endTime: currentTime })
              }}
            >
              Set to Current
            </Button>
          </div>

          <div className="flex-1">
            <Slider
              value={[marker.endTime]}
              min={0}
              max={maxDuration}
              step={0.1}
              onValueChange={([value]) => onSave({ ...marker, endTime: value })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
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