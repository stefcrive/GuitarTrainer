'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { VideoMarkers } from './VideoMarkers'
import { VideoTimeline } from './VideoTimeline'
import { VideoControls } from './VideoControls'
import type { VideoPlayerControls } from '@/types/video'
import type { VideoFile } from '@/services/file-system'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'

interface VideoPlayerProps {
  videoFile: File | null
  video?: VideoFile
  directoryHandle?: FileSystemDirectoryHandle
  className?: string
  onControlsReady?: (controls: VideoPlayerControls) => void
  onPrevVideo?: () => void
  onNextVideo?: () => void
}

export function VideoPlayer({
  videoFile,
  video,
  directoryHandle,
  className,
  onControlsReady,
  onPrevVideo,
  onNextVideo
}: VideoPlayerProps) {
  const [videoData, setVideoData] = useState<{ url: string; type: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasTrackedView = useRef(false)

  // Use the video markers hook with the video path from the VideoFile
  const { markerState, setMarkerState, isLoaded } = useVideoMarkers(video?.path || '')

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

  // Track current time for timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
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
    }

    videoElement.addEventListener('error', handleError)
    videoElement.addEventListener('loadstart', handleLoadStart)
    videoElement.addEventListener('canplay', handleCanPlay)

    return () => {
      videoElement.removeEventListener('error', handleError)
      videoElement.removeEventListener('loadstart', handleLoadStart)
      videoElement.removeEventListener('canplay', handleCanPlay)
    }
  }, [video, directoryHandle])

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
      <div className="space-y-2">
        <video
          ref={videoRef}
          className="w-full"
          controls
          autoPlay={false}
          preload="metadata"
          playsInline
          key={videoData.url}
        >
          <source src={videoData.url} type={videoData.type} />
          Your browser does not support the video tag.
        </video>

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
              isLooping: false
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
          markerState={markerState}
          setMarkerState={setMarkerState}
          className="mt-4"
        />
      </div>
    </div>
  )
}