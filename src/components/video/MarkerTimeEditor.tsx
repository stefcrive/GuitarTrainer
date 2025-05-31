'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TimeMarker, VideoPlayerControls } from '@/types/video'
import { cn } from '@/lib/utils'

interface MarkerTimeEditorProps {
  marker: TimeMarker
  maxDuration: number
  videoControls: VideoPlayerControls
  onSave: (updatedMarker: TimeMarker) => void
  onDelete: () => void
  className?: string
}

export function MarkerTimeEditor({
  marker,
  maxDuration,
  videoControls,
  onSave,
  onDelete,
  className
}: MarkerTimeEditorProps) {
  const [startTime, setStartTime] = useState(marker.startTime)
  const [endTime, setEndTime] = useState(marker.endTime)
  const [error, setError] = useState<string | null>(null)

  // Update local state when marker prop changes
  useEffect(() => {
    setStartTime(marker.startTime)
    setEndTime(marker.endTime)
  }, [marker])

  const validateAndSave = () => {
    if (startTime >= endTime) {
      setError('Start time must be before end time')
      return
    }

    if (startTime < 0 || endTime > maxDuration) {
      setError('Times must be within video duration')
      return
    }

    setError(null)
    onSave({
      ...marker,
      startTime,
      endTime
    })
  }

  // Convert seconds to HH:mm:ss format
  const formatTimeForInput = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Parse HH:mm:ss format to seconds
  const parseTimeInput = (value: string): number | null => {
    const match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return null

    const [, hours, minutes, seconds] = match // Using comma to skip first element
    const hrs = parseInt(hours, 10)
    const mins = parseInt(minutes, 10)
    const secs = parseInt(seconds, 10)

    if (hrs > 23 || mins > 59 || secs > 59) return null
    
    return (hrs * 3600) + (mins * 60) + secs
  }

  // Handle time input changes
  const handleTimeChange = (type: 'start' | 'end', value: string) => {
    const parsed = parseTimeInput(value)
    if (parsed === null) return // Invalid format, ignore

    if (type === 'start') {
      setStartTime(parsed)
    } else {
      setEndTime(parsed)
    }
    setError(null)
  }

  // Sync with current video position
  const syncWithCursor = (type: 'start' | 'end') => {
    const currentTime = videoControls.getCurrentTime()
    
    if (type === 'start') {
      if (currentTime >= endTime) {
        setError('Start time must be before end time')
        return
      }
      setStartTime(currentTime)
    } else {
      if (currentTime <= startTime) {
        setError('End time must be after start time')
        return
      }
      setEndTime(currentTime)
    }
    setError(null)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-sm font-medium">Start Time</label>
            <input
              type="text"
              pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
              value={formatTimeForInput(startTime)}
              onChange={e => handleTimeChange('start', e.target.value)}
              className="w-full p-1 border rounded text-sm font-mono"
              placeholder="00:00:00"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => syncWithCursor('start')}
            className="mt-5"
          >
            Sync
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-sm font-medium">End Time</label>
            <input
              type="text"
              pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
              value={formatTimeForInput(endTime)}
              onChange={e => handleTimeChange('end', e.target.value)}
              className="w-full p-1 border rounded text-sm font-mono"
              placeholder="00:00:00"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => syncWithCursor('end')}
            className="mt-5"
          >
            Sync
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={validateAndSave}
        >
          Update Times
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          Delete Marker
        </Button>
      </div>
    </div>
  )
}