'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { VideoMarkers } from './VideoMarkers'
import { VideoTimeline } from './VideoTimeline'
import { VideoControls } from './VideoControls'
import type { VideoPlayerControls } from '@/types/video'
import type { VideoFile } from '@/services/file-system'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useFloatingPlayer } from '@/contexts/floating-player-context'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { FavoriteButton } from './FavoriteButton'

interface VideoPlayerProps {
  videoFile: File | null
  video?: VideoFile
  directoryHandle?: FileSystemDirectoryHandle
  className?: string
  onControlsReady?: (controls: VideoPlayerControls) => void
  onPrevVideo?: () => void
  onNextVideo?: () => void
  selectedMarkerId?: string | null
  onMarkerSelect?: (markerId: string | null) => void
  inFloatingWindow?: boolean
  syncCurrentTime?: number
  syncIsPlaying?: boolean
}

export function VideoPlayer({
  videoFile,
  video,
  directoryHandle,
  className,
  onControlsReady,
  onPrevVideo,
  onNextVideo,
  selectedMarkerId,
  onMarkerSelect,
  inFloatingWindow = false,
  syncCurrentTime,
  syncIsPlaying
}: VideoPlayerProps) {
  const [videoData, setVideoData] = useState<{ url: string; type: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasTrackedView = useRef(false)

  // Use the video markers hook with the video path from the VideoFile
  const { markerState, setMarkerState, isLoaded } = useVideoMarkers(video?.path || '')
  
  // Use floating player context
  const { openPlayer } = useFloatingPlayer()

  // Create video controls interface
  const videoControls: VideoPlayerControls = useMemo(() => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
      }
    },
    seekForward: () => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(
          (videoRef.current.currentTime || 0) + 10,
          videoRef.current.duration || 0
        )
      }
    },
    seekBackward: () => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          (videoRef.current.currentTime || 0) - 10,
          0
        )
      }
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    setPlaybackRate: (rate: number) => {
      if (videoRef.current) {
        videoRef.current.playbackRate = rate
      }
    },
    getPlaybackRate: () => videoRef.current?.playbackRate || 1.0,
    getVideoElement: () => videoRef.current
  }), [])

  // Notify parent of controls availability
  useEffect(() => {
    onControlsReady?.(videoControls)
  }, [videoControls, onControlsReady])

  // Track current time and play state for timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handlePlay = () => {
      setIsPlaying(true)
    }

    const handlePause = () => {
      setIsPlaying(false)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  // Handle URL creation and cleanup
  useEffect(() => {
    let url: string | null = null

    const setupVideo = async () => {
      if (!videoFile) {
        setVideoData(null)
        setError(null)
        setIsLoading(false)
        hasTrackedView.current = false
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        console.log('VideoPlayer: Setting up video', {
          name: videoFile.name,
          type: videoFile.type,
          size: videoFile.size
        })

        // Create new URL for the video file
        url = URL.createObjectURL(videoFile)
        console.log('VideoPlayer: Created URL:', url)

        // Test if video is playable
        const video = videoRef.current
        if (video) {
          video.load() // Force reload with new source
        }

        setVideoData({
          url,
          type: videoFile.type || 'video/mp4'
        })
      } catch (err) {
        console.error('VideoPlayer: Error setting up video:', err)
        setError('Error loading video')
        if (url) {
          URL.revokeObjectURL(url)
        }
      } finally {
        setIsLoading(false)
      }
    }

    setupVideo()

    // Cleanup function
    return () => {
      if (url) {
        console.log('VideoPlayer: Cleaning up URL:', url)
        URL.revokeObjectURL(url)
      }
    }
  }, [videoFile])

  // Handle video loading events
  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    const handleError = () => {
      console.error('VideoPlayer: Video element error:', videoElement.error)
      setError('Error playing video')
    }

    const handleLoadStart = () => {
      console.log('VideoPlayer: Video loading started')
      setIsLoading(true)
    }

    const handleCanPlay = async () => {
      console.log('VideoPlayer: Video can play')
      setIsLoading(false)
      setError(null)

      // Track video view when it's ready to play and we have the necessary metadata
      if (!hasTrackedView.current && videoElement.readyState >= 2) {
        try {
          // Only track if we have both video metadata and directory handle
          if (video && directoryHandle && !hasTrackedView.current) {
            await recentlyViewedService.addRecentVideo(video, directoryHandle)
            hasTrackedView.current = true
          }
        } catch (err) {
          console.error('Error tracking video view:', err)
        }
      }

      // Handle synchronization when in floating window
      if (inFloatingWindow && syncCurrentTime !== undefined) {
        console.log('VideoPlayer: Synchronizing playback', { syncCurrentTime, syncIsPlaying })
        videoElement.currentTime = syncCurrentTime
        
        if (syncIsPlaying) {
          try {
            await videoElement.play()
          } catch (err) {
            console.error('VideoPlayer: Auto-play failed:', err)
          }
        }
      }
    }

    videoElement.addEventListener('error', handleError)
    videoElement.addEventListener('loadstart', handleLoadStart)
    videoElement.addEventListener('canplay', handleCanPlay)

    return () => {
      videoElement.removeEventListener('error', handleError)
      videoElement.removeEventListener('loadstart', handleLoadStart)
      videoElement.removeEventListener('canplay', handleCanPlay)
    }
  }, [video, directoryHandle, inFloatingWindow, syncCurrentTime, syncIsPlaying])

  if (!videoFile) {
    return (
      <div className={`flex items-center justify-center min-h-[300px] bg-muted ${className}`}>
        <p className="text-muted-foreground">Select a video to play</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-[300px] bg-muted ${className}`}>
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (isLoading || !videoData || !isLoaded) {
    return (
      <div className={`flex items-center justify-center min-h-[300px] bg-muted ${className}`}>
        <p className="text-muted-foreground">
          {!isLoaded ? 'Loading markers...' : 'Loading video...'}
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Title with favorite and open in window buttons */}
        <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium truncate">{video?.name || 'Video'}</h2>
            {video && directoryHandle && (
              <FavoriteButton
                video={video}
                directoryHandle={directoryHandle}
              />
            )}
          </div>
          {!inFloatingWindow && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (videoFile && video) {
                  openPlayer({
                    type: 'video',
                    title: video.name,
                    file: videoFile,
                    videoFile: video,
                    directoryHandle,
                    selectedMarkerId,
                    onMarkerSelect,
                    currentTime,
                    isPlaying
                  }, () => {
                    // Pause main player when opening floating window
                    if (videoRef.current && !videoRef.current.paused) {
                      videoRef.current.pause()
                      setIsPlaying(false)
                    }
                  })
                }
              }}
              className="gap-2 ml-2 flex-shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Window
            </Button>
          )}
        </div>

        <div className="aspect-video bg-black rounded overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            autoPlay={false}
            preload="metadata"
            playsInline
            key={videoData.url}
          >
            <source src={videoData.url} type={videoData.type} />
            Your browser does not support the video tag.
          </video>
        </div>

        <VideoTimeline
          duration={videoRef.current?.duration || 0}
          currentTime={currentTime}
          markers={markerState.markers}
          onSeek={(time) => videoControls.seek(time)}
        />

        <VideoControls
          controls={videoControls}
          onPrevVideo={onPrevVideo}
          onNextVideo={onNextVideo}
          onAddMarker={() => {
            const currentTime = videoControls.getCurrentTime()
            const duration = videoControls.getDuration()
            
            const newMarker = {
              id: crypto.randomUUID(),
              startTime: currentTime,
              endTime: Math.min(currentTime + 10, duration),
              isLooping: false,
              createdAt: Date.now() // Add creation timestamp
            }
        
            setMarkerState({
              ...markerState,
              markers: [...markerState.markers, newMarker],
              activeMarkerId: newMarker.id
            })
          }}
        />

        <VideoMarkers
          videoControls={videoControls}
          markerState={{
            ...markerState,
            activeMarkerId: selectedMarkerId || markerState.activeMarkerId
          }}
          setMarkerState={(newState) => {
            setMarkerState(newState)
            // Notify parent about active marker changes
            if (onMarkerSelect && newState.activeMarkerId !== markerState.activeMarkerId) {
              onMarkerSelect(newState.activeMarkerId)
            }
          }}
          className="mt-4"
        />
      </div>
    </div>
  )
}