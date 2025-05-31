'use client'

import { useVideoMarkers } from '@/hooks/useVideoMarkers'

interface VideoTitleProps {
  title: string
  videoId?: string
  videoPath?: string
  className?: string
}

export function VideoTitle({ title, videoId, videoPath, className = '' }: VideoTitleProps) {
  const markerPath = videoId ? `youtube:${videoId}` : videoPath
  const { markerState } = useVideoMarkers(markerPath || '')

  const hasMarkers = markerState.markers.length > 0

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span>{title}</span>
      {hasMarkers && (
        <div className="w-2 h-2 rounded-full bg-blue-500" title="Has markers" />
      )}
    </div>
  )
}