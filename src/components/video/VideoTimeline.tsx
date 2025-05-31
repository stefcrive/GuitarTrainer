'use client'

import { useEffect, useRef, useState } from 'react'
import type { TimeMarker } from '@/types/video'
import { cn } from '@/lib/utils'

interface VideoTimelineProps {
  duration: number
  currentTime: number
  markers: TimeMarker[]
  onSeek: (time: number) => void
  className?: string
}

export function VideoTimeline({
  duration,
  currentTime,
  markers,
  onSeek,
  className
}: VideoTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Convert time to percentage of timeline width
  const timeToPercent = (time: number) => (time / duration) * 100

  // Convert timeline click position to video time
  const positionToTime = (clientX: number) => {
    if (!timelineRef.current) return 0

    const rect = timelineRef.current.getBoundingClientRect()
    const position = clientX - rect.left
    const percent = position / rect.width
    return percent * duration
  }

  // Handle mouse events for seeking
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    const time = positionToTime(e.clientX)
    onSeek(time)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    const time = positionToTime(e.clientX)
    onSeek(time)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Add and remove event listeners for drag seeking
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={timelineRef}
      className={cn('relative h-8 bg-muted rounded cursor-pointer', className)}
      onMouseDown={handleMouseDown}
    >
      {/* Timeline progress */}
      <div
        className="absolute h-full bg-primary/20"
        style={{ width: `${timeToPercent(currentTime)}%` }}
      />

      {/* Marker indicators */}
      {markers.flatMap(marker => [
        // Start marker line
        <div
          key={`${marker.id}-start`}
          className="absolute top-0 bottom-0 w-0.5 bg-primary opacity-70"
          style={{ left: `${timeToPercent(marker.startTime)}%` }}
          title={`Start: ${marker.startTime.toFixed(2)}s`}
        />,
        // End marker line
        <div
          key={`${marker.id}-end`}
          className="absolute top-0 bottom-0 w-0.5 bg-secondary opacity-70"
          style={{ left: `${timeToPercent(marker.endTime)}%` }}
          title={`End: ${marker.endTime.toFixed(2)}s`}
        />,
        // Optional: Highlighted duration area (if still desired)
        marker.isLooping && (
          <div
            key={`${marker.id}-loop`}
            className="absolute top-0 bottom-0 opacity-20 bg-primary"
            style={{
              left: `${timeToPercent(marker.startTime)}%`,
              width: `${timeToPercent(marker.endTime - marker.startTime)}%`
            }}
            title={`Looping: ${marker.startTime.toFixed(2)}s - ${marker.endTime.toFixed(2)}s`}
          />
        )
      ])}

      {/* Current time indicator */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-primary"
        style={{ left: `${timeToPercent(currentTime)}%` }}
      />
    </div>
  )
}