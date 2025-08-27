'use client'

import React, { useRef, useState, useEffect } from 'react'
import { useFloatingPlayer } from '@/contexts/floating-player-context'
import { Button } from '@/components/ui/button'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { X, Minimize2, Maximize2, Move, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FloatingPlayer() {
  const { player, closePlayer, minimizePlayer, maximizePlayer, setPosition, setSize } = useFloatingPlayer()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - player.size.width, e.clientX - dragStart.x))
        const newY = Math.max(0, Math.min(window.innerHeight - player.size.height, e.clientY - dragStart.y))
        setPosition({ x: newX, y: newY })
      }
      
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x
        const deltaY = e.clientY - resizeStart.y
        const newWidth = Math.max(400, Math.min(1200, resizeStart.width + deltaX))
        const newHeight = Math.max(300, Math.min(800, resizeStart.height + deltaY))
        setSize({ width: newWidth, height: newHeight })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = isDragging ? 'grabbing' : 'nw-resize'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, isResizing, dragStart, resizeStart, player.size, setPosition, setSize])

  if (!player.isOpen || !player.content) return null

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('.drag-handle')) return
    
    setIsDragging(true)
    setDragStart({
      x: e.clientX - player.position.x,
      y: e.clientY - player.position.y
    })
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: player.size.width,
      height: player.size.height
    })
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed bg-background border border-border rounded-lg shadow-2xl z-50 overflow-hidden",
        isDragging && "cursor-grabbing",
        player.isMinimized && "h-12"
      )}
      style={{
        left: player.position.x,
        top: player.position.y,
        width: player.size.width,
        height: player.isMinimized ? 48 : player.size.height,
        maxWidth: '90vw',
        maxHeight: '90vh'
      }}
    >
      {/* Header */}
      <div
        className="drag-handle flex items-center justify-between p-2 bg-muted/50 border-b cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Move className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {player.content.title}
          </span>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={player.isMinimized ? maximizePlayer : minimizePlayer}
          >
            {player.isMinimized ? (
              <Maximize2 className="h-3 w-3" />
            ) : (
              <Minimize2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={closePlayer}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!player.isMinimized && (
        <div className="relative h-full" style={{ height: `calc(${player.size.height}px - 48px)` }}>
          <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800">
            {player.content.type === 'video' && player.content.file && player.content.videoFile && (
              <VideoPlayer
                videoFile={player.content.file}
                video={player.content.videoFile}
                directoryHandle={player.content.directoryHandle}
                selectedMarkerId={player.content.selectedMarkerId}
                onMarkerSelect={player.content.onMarkerSelect}
                className="min-h-full"
              />
            )}
            
            {player.content.type === 'audio' && player.content.audioFile && (
              <div className="min-h-full">
                <AudioPlayer
                  audioFile={player.content.audioFile}
                  selectedMarkerId={player.content.selectedMarkerId}
                  onMarkerSelect={player.content.onMarkerSelect}
                />
              </div>
            )}
            
            {player.content.type === 'youtube' && player.content.youtubeId && (
              <div className="min-h-full">
                <YouTubePlayer
                  videoId={player.content.youtubeId}
                  className="w-full min-h-full"
                />
              </div>
            )}
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nw-resize hover:bg-primary/20 transition-colors"
            onMouseDown={handleResizeMouseDown}
          >
            <GripHorizontal className="h-3 w-3 absolute bottom-0.5 right-0.5 text-muted-foreground rotate-45" />
          </div>
        </div>
      )}
    </div>
  )
}