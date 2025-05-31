'use client'

import { useEffect, useRef, useState } from 'react'
import { VideoMarkers } from '../video/VideoMarkers'
import { VideoTimeline } from '../video/VideoTimeline'
import { VideoControls } from '../video/VideoControls'
import type { VideoPlayerControls } from '@/types/video'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { youtubeApi } from '@/services/youtube-api'

interface YouTubePlayerProps {
  videoId: string
  className?: string
  onControlsReady?: (controls: VideoPlayerControls) => void
  onPrevVideo?: () => void
  onNextVideo?: () => void
}

export function YouTubePlayer({
  videoId,
  className,
  onControlsReady,
  onPrevVideo,
  onNextVideo
}: YouTubePlayerProps) {
  const playerRef = useRef<YT.Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [initializeAttempt, setInitializeAttempt] = useState(0)
  const timeUpdateInterval = useRef<NodeJS.Timeout>()
  const retryTimeoutRef = useRef<NodeJS.Timeout>()
  const containerId = `youtube-player-${videoId}`

  const MAX_INIT_ATTEMPTS = 3

  // Use video markers with YouTube video ID
  const { markerState, setMarkerState, isLoaded } = useVideoMarkers(`youtube:${videoId}`)

  // Initialize YouTube player
  useEffect(() => {
    let mounted = true
    let retryCount = 0
    const maxRetries = 3

    const initPlayer = async () => {
      if (retryCount >= maxRetries) {
        setError('Failed to initialize player after several attempts')
        setIsLoading(false)
        return
      }

      try {
        if (!document.getElementById(containerId)) {
          console.error('Container not found')
          return
        }

        // Make sure YT API is loaded
        await youtubeApi.ensurePlayerAPI()
        if (!mounted) return

        console.log('Creating player...')
        playerRef.current = new window.YT.Player(containerId, {
          videoId,
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
            controls: 1
          },
          events: {
            onReady: (event) => {
              if (!mounted) return
              console.log('Player ready')
              setIsReady(true)
              setIsLoading(false)
              const dur = event.target.getDuration()
              if (dur > 0) setDuration(dur)
              startTimeTracking()
            },
            onStateChange: (event) => {
              if (!mounted) return
              console.log('Player state:', event.data)
              if (event.data === window.YT.PlayerState.PLAYING) {
                startTimeTracking()
              } else {
                stopTimeTracking()
              }
            },
            onError: (event) => {
              console.error('Player error:', event)
              const errorCode = event.data
              let errorMessage = 'Error playing video'
              let shouldRetry = false
              
              switch(errorCode) {
                case 2:
                  errorMessage = 'Invalid video ID'
                  break
                case 5:
                  errorMessage = 'HTML5 player error'
                  shouldRetry = true
                  break
                case 100:
                  errorMessage = 'Video not found'
                  break
                case 101:
                case 150:
                  errorMessage = 'Video cannot be played in embedded player. This can happen if the video owner has disabled embedding.'
                  shouldRetry = true
                  break
              }
              
              setError(errorMessage)
              setIsLoading(false)
              
              if (shouldRetry && initializeAttempt < MAX_INIT_ATTEMPTS) {
                setInitializeAttempt(prev => prev + 1)
                if (playerRef.current) {
                  playerRef.current.destroy()
                  playerRef.current = null
                }
                // Wait longer between each attempt
                const delay = 2000 * (initializeAttempt + 1)
                console.log(`Retrying player initialization in ${delay}ms (attempt ${initializeAttempt + 1}/${MAX_INIT_ATTEMPTS})`)
                retryTimeoutRef.current = setTimeout(() => {
                  setError(null)
                  setIsLoading(true)
                  youtubeApi.resetApiState()
                  initPlayer()
                }, delay)
              }
            }
          }
        })
      } catch (err) {
        console.error('Error creating player:', err)
        retryCount++
        // Try again after a short delay
        setTimeout(initPlayer, 1000)
      }
    }

    // Ensure API is loaded first
    youtubeApi.loadAPI().then(() => {
      if (mounted) {
        initPlayer()
      }
    }).catch(err => {
      console.error('Failed to load YouTube API:', err)
      if (mounted) {
        setError('Failed to load YouTube API')
        setIsLoading(false)
      }
    })

    return () => {
      mounted = false
      stopTimeTracking()
      
      // Clear any pending retries
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      
      // Ensure player is destroyed
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch (err) {
          console.error('Error destroying player:', err)
        }
        playerRef.current = null
      }
      
      // Clear any error state
      setError(null)
    }
  }, [videoId, containerId, initializeAttempt, MAX_INIT_ATTEMPTS])

  // Track video time
  const startTimeTracking = () => {
    stopTimeTracking()
    timeUpdateInterval.current = setInterval(() => {
      if (playerRef.current) {
        const time = playerRef.current.getCurrentTime()
        setCurrentTime(time)
        if (!duration) {
          const dur = playerRef.current.getDuration()
          if (dur > 0) setDuration(dur)
        }
      }
    }, 200)
  }

  const stopTimeTracking = () => {
    if (timeUpdateInterval.current) {
      clearInterval(timeUpdateInterval.current)
      timeUpdateInterval.current = undefined
    }
  }

  // Handle seeking with relative time
  const seekRelative = (deltaSeconds: number) => {
    if (!playerRef.current) return
    const time = playerRef.current.getCurrentTime()
    const dur = playerRef.current.getDuration()
    const newTime = Math.max(0, Math.min(dur, time + deltaSeconds))
    console.log(`Seeking ${deltaSeconds}s from ${time} to ${newTime}`)
    playerRef.current.seekTo(newTime, true)
    setCurrentTime(newTime)
  }

  // Create video controls interface
  const videoControls: VideoPlayerControls = {
    play: () => {
      console.log('Play command')
      playerRef.current?.playVideo()
    },
    pause: () => {
      console.log('Pause command')
      playerRef.current?.pauseVideo()
    },
    seek: (time: number) => {
      if (!playerRef.current || time < 0 || time > duration) return
      console.log(`Seek to ${time}`)
      playerRef.current.seekTo(time, true)
      setCurrentTime(time)
    },
    seekForward: () => seekRelative(10),
    seekBackward: () => seekRelative(-10),
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    setPlaybackRate: (rate: number) => {
      console.log(`Setting playback rate to ${rate}x`)
      playerRef.current?.setPlaybackRate(rate)
    },
    getPlaybackRate: () => {
      return playerRef.current?.getPlaybackRate() || 1.0
    },
    getVideoElement: () => {
      if (!playerRef.current) return null
      const iframe = document.getElementById(containerId)?.querySelector('iframe')
      if (!iframe) return null
      return iframe
    }
  }

  // Notify parent of controls availability
  useEffect(() => {
    if (isReady && duration > 0) {
      console.log('Controls ready, duration:', duration)
      onControlsReady?.(videoControls)
    }
  }, [isReady, duration, onControlsReady])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-[300px] bg-muted ${className}`}>
        <p className="text-destructive text-center mb-2">{error}</p>
        {initializeAttempt > 0 && initializeAttempt < MAX_INIT_ATTEMPTS && (
          <p className="text-sm text-muted-foreground">
            Retrying... Attempt {initializeAttempt + 1} of {MAX_INIT_ATTEMPTS}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        <div className="relative pt-[56.25%] bg-black">
          <div className="absolute inset-0">
            <div 
              id={containerId}
              className="w-full h-full"
            />
          </div>
        </div>

        {isReady && duration > 0 ? (
          <>
            <VideoTimeline
              duration={duration}
              currentTime={currentTime}
              markers={markerState.markers}
              onSeek={(time) => videoControls.seek(time)}
            />

            <VideoControls
              controls={videoControls}
              onPrevVideo={onPrevVideo}
              onNextVideo={onNextVideo}
              onAddMarker={() => {
                if (markerState && setMarkerState) {
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
                }
              }}
            />

            <VideoMarkers
              videoControls={videoControls}
              markerState={markerState}
              setMarkerState={setMarkerState}
              className="mt-4"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-24 bg-muted rounded">
            <div className="text-center">
              <p className="text-muted-foreground">Loading video...</p>
              {isLoading && (
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {!youtubeApi.isReady() ? 'Loading YouTube API...' : 'Initializing player...'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}