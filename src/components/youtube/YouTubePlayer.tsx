'use client'

import { useEffect, useRef, useState } from 'react'
import { VideoMarkers } from '../video/VideoMarkers'
import { VideoTimeline } from '../video/VideoTimeline'
import { VideoControls } from '../video/VideoControls'
import type { VideoPlayerControls } from '@/types/video'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { youtubeApi } from '@/services/youtube-api'
import { useFloatingPlayer } from '@/contexts/floating-player-context'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

interface YouTubePlayerProps {
  videoId: string
  className?: string
  onControlsReady?: (controls: VideoPlayerControls) => void
  onPrevVideo?: () => void
  onNextVideo?: () => void
  inFloatingWindow?: boolean
}

export function YouTubePlayer({
  videoId,
  className,
  onControlsReady,
  onPrevVideo,
  onNextVideo,
  inFloatingWindow = false
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
  const containerIdRef = useRef<string>()
  
  // Generate container ID once
  if (!containerIdRef.current) {
    containerIdRef.current = `youtube-player-${videoId}${inFloatingWindow ? `-floating-${Date.now()}` : ''}`
  }
  const containerId = containerIdRef.current

  const MAX_INIT_ATTEMPTS = 3

  // Use video markers with YouTube video ID
  const { markerState, setMarkerState, isLoaded } = useVideoMarkers(`youtube:${videoId}`)
  
  // Use floating player context
  const { openPlayer } = useFloatingPlayer()

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
        // Wait for DOM element to be available, especially important for floating windows
        let retries = 0
        const maxDomRetries = 10
        while (!document.getElementById(containerId) && retries < maxDomRetries) {
          console.log(`Waiting for container ${containerId} (attempt ${retries + 1})`)
          await new Promise(resolve => setTimeout(resolve, 100))
          retries++
        }

        if (!document.getElementById(containerId)) {
          console.error(`Container ${containerId} not found after ${maxDomRetries} retries`)
          return
        }

        // Make sure YT API is loaded
        console.log(`${inFloatingWindow ? '[Floating] ' : ''}Ensuring YouTube API is ready...`)
        await youtubeApi.ensurePlayerAPI()
        if (!mounted) return

        console.log(`${inFloatingWindow ? '[Floating] ' : ''}Creating player for container ${containerId}...`)
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
              console.log(`${inFloatingWindow ? '[Floating] ' : ''}Player ready`)
              setIsReady(true)
              setIsLoading(false)
              try {
                if (event.target && typeof event.target.getDuration === 'function') {
                  const dur = event.target.getDuration()
                  if (dur > 0) setDuration(dur)
                }
                startTimeTracking()
              } catch (error) {
                console.warn(`${inFloatingWindow ? '[Floating] ' : ''}Error in onReady handler:`, error)
              }
            },
            onStateChange: (event) => {
              if (!mounted) return
              console.log(`${inFloatingWindow ? '[Floating] ' : ''}Player state:`, event.data)
              if (event.data === window.YT.PlayerState.PLAYING) {
                startTimeTracking()
              } else {
                stopTimeTracking()
              }
            },
            onError: (event) => {
              console.error(`${inFloatingWindow ? '[Floating] ' : ''}Player error:`, event)
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
        console.error(`${inFloatingWindow ? '[Floating] ' : ''}Error creating player:`, err)
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
      console.error(`${inFloatingWindow ? '[Floating] ' : ''}Failed to load YouTube API:`, err)
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
      try {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const time = playerRef.current.getCurrentTime()
          setCurrentTime(time)
          
          if (!duration && typeof playerRef.current.getDuration === 'function') {
            const dur = playerRef.current.getDuration()
            if (dur > 0) setDuration(dur)
          }
        }
      } catch (error) {
        console.warn('Error in time tracking:', error)
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
    try {
      if (!playerRef.current) return
      
      if (typeof playerRef.current.getCurrentTime !== 'function' ||
          typeof playerRef.current.getDuration !== 'function' ||
          typeof playerRef.current.seekTo !== 'function') {
        console.warn('Required YouTube player methods not available')
        return
      }
      
      const time = playerRef.current.getCurrentTime()
      const dur = playerRef.current.getDuration()
      const newTime = Math.max(0, Math.min(dur, time + deltaSeconds))
      console.log(`Seeking ${deltaSeconds}s from ${time} to ${newTime}`)
      playerRef.current.seekTo(newTime, true)
      setCurrentTime(newTime)
    } catch (error) {
      console.warn('Error in relative seeking:', error)
    }
  }

  // Create video controls interface
  const videoControls: VideoPlayerControls = {
    play: () => {
      console.log('Play command')
      try {
        if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo()
        }
      } catch (error) {
        console.warn('Error playing video:', error)
      }
    },
    pause: () => {
      console.log('Pause command')
      try {
        if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo()
        }
      } catch (error) {
        console.warn('Error pausing video:', error)
      }
    },
    seek: (time: number) => {
      if (time < 0 || time > duration) return
      console.log(`Seek to ${time}`)
      try {
        if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(time, true)
          setCurrentTime(time)
        }
      } catch (error) {
        console.warn('Error seeking video:', error)
      }
    },
    seekForward: () => seekRelative(10),
    seekBackward: () => seekRelative(-10),
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    setPlaybackRate: (rate: number) => {
      console.log(`Setting playback rate to ${rate}x`)
      try {
        if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
          playerRef.current.setPlaybackRate(rate)
        }
      } catch (error) {
        console.warn('Error setting playback rate:', error)
      }
    },
    getPlaybackRate: () => {
      try {
        if (playerRef.current && typeof playerRef.current.getPlaybackRate === 'function') {
          return playerRef.current.getPlaybackRate()
        }
        return 1.0
      } catch (error) {
        console.warn('Error getting playback rate:', error)
        return 1.0
      }
    },
    getVideoElement: () => {
      try {
        if (!playerRef.current) return null
        const container = document.getElementById(containerId)
        if (!container) return null
        const iframe = container.querySelector('iframe')
        if (!iframe) return null
        return iframe
      } catch (error) {
        console.warn('Error getting video element:', error)
        return null
      }
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
        {/* Display video title at the top */}
        {videoId && (
          <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md flex items-center justify-between">
            <h2 className="text-lg font-medium truncate">
              {`YouTube Video: ${videoId}`}
            </h2>
            {!inFloatingWindow && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  openPlayer({
                    type: 'youtube',
                    title: `YouTube Video: ${videoId}`,
                    youtubeId: videoId
                  })
                }}
                className="gap-2 ml-2 flex-shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Window
              </Button>
            )}
          </div>
        )}
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
                    isLooping: false,
                    createdAt: Date.now() // Add creation timestamp
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
              contentType="youtube"
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