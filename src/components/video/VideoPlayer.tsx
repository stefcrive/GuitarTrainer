'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { VideoMarkers } from './VideoMarkers'
import { VideoTimeline } from './VideoTimeline'
import { VideoControls } from './VideoControls'
import type { VideoPlayerControls } from '@/types/video'
import type { VideoFile } from '@/services/file-system'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'
import { markersService } from '@/services/markers'
import { reloadDatabaseContext } from '@/services/local-sql-db'
import { useDirectoryStore } from '@/stores/directory-store'
import { useFloatingPlayer } from '@/contexts/floating-player-context'
import { Button } from '@/components/ui/button'
import { StatusBanner } from '@/components/ui/status-banner'
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
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

type MarkerGenerationJob = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  phase: string
  progress: number
  elapsedMs: number
  error?: string
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
  const [isGeneratingMarkers, setIsGeneratingMarkers] = useState(false)
  const [markerGenerationJob, setMarkerGenerationJob] = useState<MarkerGenerationJob | null>(null)
  const [markerGenerationStatus, setMarkerGenerationStatus] = useState<string | null>(null)
  const [markerGenerationError, setMarkerGenerationError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasTrackedView = useRef(false)
  const completedMarkerJobIds = useRef<Set<string>>(new Set())

  const { markerState, setMarkerState, isLoaded } = useVideoMarkers(video?.path || '', videoFile)
  const { openPlayer } = useFloatingPlayer()
  const rootPath = useDirectoryStore((state) => state.rootPath)

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

  const generateAutomaticMarkers = async () => {
    if (!video || !directoryHandle) {
      setMarkerGenerationError('Load a local video before generating markers.')
      return
    }

    setIsGeneratingMarkers(true)
    setMarkerGenerationError(null)
    setMarkerGenerationStatus(null)
    setMarkerGenerationJob(null)

    try {
      const response = await fetch('/api/automatic-marker-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: video.path,
          rootFolder: rootPath ?? undefined,
          rootName: directoryHandle.name
        })
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Automatic marker generation failed.')
      }

      setMarkerGenerationJob({
        id: payload.jobId,
        status: payload.status,
        phase: payload.phase,
        progress: payload.progress,
        elapsedMs: 0
      })
    } catch (generationError) {
      setMarkerGenerationJob(null)
      setMarkerGenerationStatus(null)
      setMarkerGenerationError(
        generationError instanceof Error ? generationError.message : 'Automatic marker generation failed.'
      )
      setIsGeneratingMarkers(false)
    }
  }

  useEffect(() => {
    if (!markerGenerationJob?.id || !video || !directoryHandle) return
    if (markerGenerationJob.status !== 'queued' && markerGenerationJob.status !== 'running') return

    let isCancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const pollJob = async () => {
      try {
        const response = await fetch(`/api/automatic-marker-generation?jobId=${encodeURIComponent(markerGenerationJob.id)}`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to read marker generation progress.')
        }
        if (isCancelled) return

        const nextJob = payload.job as MarkerGenerationJob
        setMarkerGenerationJob(nextJob)

        if (nextJob.status === 'completed') {
          if (intervalId) clearInterval(intervalId)
          setIsGeneratingMarkers(false)

          if (!completedMarkerJobIds.current.has(nextJob.id)) {
            completedMarkerJobIds.current.add(nextJob.id)
            await reloadDatabaseContext(directoryHandle)
            const importedState = videoFile
              ? await markersService.loadMarkersForFile(directoryHandle, video.path, videoFile)
              : await markersService.loadMarkers(directoryHandle, video.path)
            if (isCancelled) return

            if (importedState) {
              await setMarkerState(importedState)
              setMarkerGenerationStatus(
                `Generated ${importedState.markers.length} lesson marker${importedState.markers.length === 1 ? '' : 's'} with titles and tags.`
              )
            } else {
              setMarkerGenerationStatus('Processing finished, but no generated markers were imported for this video.')
            }
          }
        }

        if (nextJob.status === 'failed') {
          if (intervalId) clearInterval(intervalId)
          setIsGeneratingMarkers(false)
          setMarkerGenerationError(nextJob.error || 'Automatic marker generation failed.')
        }
      } catch (pollError) {
        if (isCancelled) return
        if (intervalId) clearInterval(intervalId)
        setIsGeneratingMarkers(false)
        setMarkerGenerationError(
          pollError instanceof Error ? pollError.message : 'Unable to read marker generation progress.'
        )
      }
    }

    void pollJob()
    intervalId = setInterval(pollJob, 2000)

    return () => {
      isCancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [markerGenerationJob?.id, video?.path, directoryHandle, setMarkerState])

  useEffect(() => {
    onControlsReady?.(videoControls)
  }, [videoControls, onControlsReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

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
        url = URL.createObjectURL(videoFile)
        videoRef.current?.load()
        setVideoData({
          url,
          type: videoFile.type || 'video/mp4'
        })
      } catch {
        setError('Error loading video')
        if (url) URL.revokeObjectURL(url)
      } finally {
        setIsLoading(false)
      }
    }

    setupVideo()

    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [videoFile])

  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    const handleError = () => setError('Error playing video')
    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = async () => {
      setIsLoading(false)
      setError(null)

      if (!hasTrackedView.current && videoElement.readyState >= 2) {
        try {
          if (video && directoryHandle && !hasTrackedView.current) {
            await recentlyViewedService.addRecentVideo(video, directoryHandle)
            hasTrackedView.current = true
          }
        } catch (viewError) {
          console.error('Error tracking video view:', viewError)
        }
      }

      if (inFloatingWindow && syncCurrentTime !== undefined) {
        videoElement.currentTime = syncCurrentTime
        if (syncIsPlaying) {
          try {
            await videoElement.play()
          } catch (playError) {
            console.error('VideoPlayer: Auto-play failed:', playError)
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

  const markerGenerationProgress = Math.min(
    100,
    Math.max(0, Math.round(markerGenerationJob?.progress ?? 0))
  )
  const markerGenerationElapsed = markerGenerationJob
    ? formatElapsed(markerGenerationJob.elapsedMs)
    : '0:00'

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
        <div className="mb-2 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-medium">{video?.name || 'Video'}</h2>
            {video && directoryHandle && (
              <FavoriteButton video={video} directoryHandle={directoryHandle} />
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
                    if (videoRef.current && !videoRef.current.paused) {
                      videoRef.current.pause()
                      setIsPlaying(false)
                    }
                  })
                }
              }}
              className="ml-2 shrink-0 gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Window
            </Button>
          )}
        </div>

        <div className="aspect-video overflow-hidden rounded bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
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
            const startTime = videoControls.getCurrentTime()
            const duration = videoControls.getDuration()
            const newMarker = {
              id: crypto.randomUUID(),
              startTime,
              endTime: Math.min(startTime + 10, duration),
              isLooping: false,
              completionDegree: 0,
              createdAt: Date.now(),
              diagrams: []
            }

            setMarkerState((prevState) => ({
              ...prevState,
              markers: [...prevState.markers, newMarker],
              activeMarkerId: newMarker.id
            }))
          }}
        />

        <div className="rounded-md border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium">Automatic marker generation</h3>
              <p className="text-xs text-muted-foreground">
                Process this video with Whisper, then create coherent titled and tagged lesson markers.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateAutomaticMarkers}
              disabled={isGeneratingMarkers || !video || !directoryHandle}
              className="gap-2 sm:shrink-0"
            >
              {isGeneratingMarkers ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGeneratingMarkers ? 'Generating...' : 'Automatic marker generation'}
            </Button>
          </div>

          {markerGenerationJob && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-muted-foreground">
                  {markerGenerationJob.phase}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {markerGenerationProgress}% - {markerGenerationElapsed}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={markerGenerationProgress}
                aria-label="Automatic marker generation progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${markerGenerationProgress}%` }}
                />
              </div>
            </div>
          )}

          {markerGenerationStatus && (
            <StatusBanner tone="success" className="mt-3">
              {markerGenerationStatus}
            </StatusBanner>
          )}
          {markerGenerationError && (
            <StatusBanner tone="destructive" className="mt-3">
              {markerGenerationError}
            </StatusBanner>
          )}
        </div>

        <VideoMarkers
          videoControls={videoControls}
          markerState={{
            ...markerState,
            activeMarkerId: selectedMarkerId || markerState.activeMarkerId
          }}
          setMarkerState={(nextState) => {
            setMarkerState((prevState) => {
              const resolvedState =
                typeof nextState === 'function' ? nextState(prevState) : nextState
              if (onMarkerSelect && resolvedState.activeMarkerId !== prevState.activeMarkerId) {
                onMarkerSelect(resolvedState.activeMarkerId)
              }
              return resolvedState
            })
          }}
          className="mt-4"
        />
      </div>
    </div>
  )
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
