'use client'

import { useRef, useState, useEffect } from 'react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { AudioFile, AudioLoopRegion, AudioMetadata, AudioMarker, AudioAnnotation } from '@/types/audio'
import { VideoPlayerControls } from '@/types/video'
import { Play, Pause, RotateCcw, BringToFront, Timer, SkipBack, SkipForward } from 'lucide-react'
import { FavoriteButton } from '@/components/audio/FavoriteButton'
import { getAudioMetadata, saveAudioMetadata } from '@/services/audio-metadata'
import { useDirectoryStore } from '@/stores/directory-store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AudioMarkers } from './AudioMarkers'
import { useFloatingPlayer } from '@/contexts/floating-player-context'
import { ExternalLink } from 'lucide-react'

interface AudioPlayerProps {
  audioFile: AudioFile
  onControlsReady?: (controls: VideoPlayerControls) => void
  selectedMarkerId?: string | null
  onMarkerSelect?: (markerId: string | null) => void
  inFloatingWindow?: boolean
  syncCurrentTime?: number
  syncIsPlaying?: boolean
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const MIN_LOOP_SECONDS = 0.05

type PlaybackState = {
  startedAt: number
  offset: number
  rate: number
  isPlaying: boolean
}

type LoopBounds = {
  start: number
  end: number
}

async function getAudioFileHandle(rootHandle: FileSystemDirectoryHandle, path: string) {
  const segments = path.split('/').filter(Boolean)
  let currentHandle = rootHandle

  for (let i = 0; i < segments.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(segments[i])
  }

  return currentHandle.getFileHandle(segments[segments.length - 1])
}

export function AudioPlayer({ audioFile, onControlsReady, selectedMarkerId, onMarkerSelect, inFloatingWindow = false, syncCurrentTime, syncIsPlaying }: AudioPlayerProps) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const playbackStateRef = useRef<PlaybackState>({
    startedAt: 0,
    offset: 0,
    rate: 1,
    isPlaying: false
  })
  const loopRegionRef = useRef<AudioLoopRegion>({
    start: 0,
    end: 0,
    enabled: false
  })
  const markersRef = useRef<AudioMarker[]>([])
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const playbackRateRef = useRef(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [tags, setTags] = useState<string[]>([])
  const [markers, setMarkers] = useState<AudioMarker[]>([])
  const [annotations, setAnnotations] = useState<AudioAnnotation[]>([])
  const [loopRegion, setLoopRegion] = useState<AudioLoopRegion>({
    start: 0,
    end: 0,
    enabled: false
  })
  const { audioRootHandle, rootHandle } = useDirectoryStore()
  const directoryHandle = audioRootHandle || rootHandle!
  
  // Use floating player context
  const { openPlayer } = useFloatingPlayer()

  const roundToMilliseconds = (time: number) => Math.round(time * 1000) / 1000

  const clampTime = (time: number) => {
    const maxDuration = durationRef.current || duration || 0
    if (!Number.isFinite(time)) return 0
    return Math.min(Math.max(time, 0), maxDuration)
  }

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const context = new AudioContextCtor()
      const gainNode = context.createGain()
      gainNode.gain.value = volume
      gainNode.connect(context.destination)
      audioContextRef.current = context
      gainNodeRef.current = gainNode
    }

    return audioContextRef.current
  }

  const getActiveLoopBounds = (bufferDuration = durationRef.current): LoopBounds | null => {
    const loopingMarker = markersRef.current.find(
      marker => marker.isLooping && marker.endTime - marker.startTime >= MIN_LOOP_SECONDS
    )

    if (loopingMarker) {
      return {
        start: clampTime(loopingMarker.startTime),
        end: clampTime(loopingMarker.endTime)
      }
    }

    const activeLoopRegion = loopRegionRef.current
    if (!activeLoopRegion.enabled) return null

    const loopStart = clampTime(activeLoopRegion.start)
    const loopEnd = clampTime(activeLoopRegion.end || bufferDuration)
    if (loopEnd - loopStart < MIN_LOOP_SECONDS) return null

    return {
      start: loopStart,
      end: loopEnd
    }
  }

  const wrapTimeForLoop = (time: number, bounds: LoopBounds | null) => {
    if (!bounds || time < bounds.end) return clampTime(time)

    const loopLength = bounds.end - bounds.start
    if (loopLength < MIN_LOOP_SECONDS) return bounds.start

    return bounds.start + ((time - bounds.start) % loopLength)
  }

  const getRawPlaybackTime = () => {
    const state = playbackStateRef.current
    if (!state.isPlaying || !audioContextRef.current) {
      return currentTimeRef.current
    }

    const elapsed = (audioContextRef.current.currentTime - state.startedAt) * state.rate
    return state.offset + elapsed
  }

  const getPlaybackTime = () => {
    return wrapTimeForLoop(getRawPlaybackTime(), getActiveLoopBounds())
  }

  const setPlaybackPositionState = (time: number) => {
    const nextTime = roundToMilliseconds(clampTime(time))
    currentTimeRef.current = nextTime
    setCurrentTime(nextTime)
  }

  const stopSourceNode = () => {
    const source = sourceNodeRef.current
    sourceNodeRef.current = null
    if (!source) return

    source.onended = null
    try {
      source.stop()
    } catch {
      // The source may already have ended.
    }
    source.disconnect()
  }

  const configureSourceLoop = (source: AudioBufferSourceNode) => {
    const bounds = getActiveLoopBounds()
    source.loop = Boolean(bounds)
    if (bounds) {
      source.loopStart = bounds.start
      source.loopEnd = bounds.end
    }
  }

  const startSourceNode = (offset: number) => {
    const context = getAudioContext()
    const buffer = audioBufferRef.current
    if (!buffer || !gainNodeRef.current) return

    const bounds = getActiveLoopBounds(buffer.duration)
    const startOffset = wrapTimeForLoop(offset >= buffer.duration ? 0 : offset, bounds)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRateRef.current
    configureSourceLoop(source)
    source.connect(gainNodeRef.current)
    source.onended = () => {
      if (sourceNodeRef.current !== source) return
      sourceNodeRef.current = null
      playbackStateRef.current = {
        ...playbackStateRef.current,
        offset: buffer.duration,
        isPlaying: false
      }
      setPlaybackPositionState(buffer.duration)
      setIsPlaying(false)
    }

    playbackStateRef.current = {
      startedAt: context.currentTime,
      offset: startOffset,
      rate: playbackRateRef.current,
      isPlaying: true
    }
    sourceNodeRef.current = source
    setPlaybackPositionState(startOffset)
    source.start(0, startOffset)
  }

  const playAudio = async () => {
    if (!audioBufferRef.current) return

    const context = getAudioContext()
    await context.resume()
    stopSourceNode()
    startSourceNode(currentTimeRef.current)
    setIsPlaying(true)
  }

  const pauseAudio = () => {
    const pausedAt = getPlaybackTime()
    stopSourceNode()
    playbackStateRef.current = {
      ...playbackStateRef.current,
      offset: pausedAt,
      isPlaying: false
    }
    setPlaybackPositionState(pausedAt)
    setIsPlaying(false)
  }

  const seekAudio = (time: number) => {
    const wasPlaying = playbackStateRef.current.isPlaying
    const nextTime = clampTime(time)
    stopSourceNode()
    playbackStateRef.current = {
      ...playbackStateRef.current,
      offset: nextTime,
      isPlaying: false
    }
    setPlaybackPositionState(nextTime)

    if (wasPlaying) {
      startSourceNode(nextTime)
      setIsPlaying(true)
    }
  }

  const seekAudioBy = (delta: number) => {
    seekAudio(getPlaybackTime() + delta)
  }

  const updateCurrentSourceLoop = () => {
    const source = sourceNodeRef.current
    if (!source) return

    configureSourceLoop(source)
    const bounds = getActiveLoopBounds()
    const rawPlaybackTime = getRawPlaybackTime()
    if (bounds && rawPlaybackTime >= bounds.end) {
      seekAudio(wrapTimeForLoop(rawPlaybackTime, bounds))
    }
  }

  useEffect(() => {
    let isCancelled = false

    const loadAudio = async () => {
      try {
        stopSourceNode()
        audioBufferRef.current = null
        playbackStateRef.current = {
          startedAt: 0,
          offset: 0,
          rate: playbackRateRef.current,
          isPlaying: false
        }
        setIsPlaying(false)
        setCurrentTime(0)
        currentTimeRef.current = 0
        setDuration(0)
        durationRef.current = 0

        const fileHandle = audioFile.handle ?? await getAudioFileHandle(directoryHandle, audioFile.path)
        const file = await fileHandle.getFile()
        if (isCancelled) return

        // Load metadata
        const metadata = await getAudioMetadata(audioFile, directoryHandle)
        if (isCancelled) return

        setTags(metadata.tags)
        setPlaybackRate(metadata.playbackRate)
        setVolume(metadata.volume ?? 1)
        setLoopRegion(metadata.loopRegion)
        setMarkers(metadata.markers || [])
        setAnnotations(metadata.annotations || [])

        loopRegionRef.current = metadata.loopRegion
        markersRef.current = metadata.markers || []
        playbackRateRef.current = metadata.playbackRate
        playbackStateRef.current.rate = metadata.playbackRate

        const context = getAudioContext()
        const audioBuffer = await context.decodeAudioData(await file.arrayBuffer())
        if (isCancelled) return

        audioBufferRef.current = audioBuffer
        durationRef.current = audioBuffer.duration
        setDuration(audioBuffer.duration)
        setLoopRegion(prev => {
          const nextRegion = {
            ...prev,
            end: prev.end || audioBuffer.duration
          }
          loopRegionRef.current = nextRegion
          return nextRegion
        })

        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = metadata.volume ?? 1
        }

        if (inFloatingWindow && syncCurrentTime !== undefined) {
          setPlaybackPositionState(syncCurrentTime)
          if (syncIsPlaying) {
            playAudio().catch(error => {
              console.error('AudioPlayer: Auto-play failed:', error)
            })
          }
          return
        }

        playAudio().catch(error => {
          console.error('Auto-play failed:', error)
        })
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading audio file:', error)
        }
      }
    }

    loadAudio()

    return () => {
      isCancelled = true
      stopSourceNode()
    }
  }, [audioFile, directoryHandle])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!playbackStateRef.current.isPlaying) return
      setPlaybackPositionState(getPlaybackTime())
    }, 20)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    loopRegionRef.current = loopRegion
    updateCurrentSourceLoop()
  }, [loopRegion])

  useEffect(() => {
    markersRef.current = markers
    updateCurrentSourceLoop()
  }, [markers])

  useEffect(() => {
    playbackRateRef.current = playbackRate
    const state = playbackStateRef.current
    const currentPlaybackTime = getPlaybackTime()
    playbackStateRef.current = {
      startedAt: audioContextRef.current?.currentTime ?? 0,
      offset: currentPlaybackTime,
      rate: playbackRate,
      isPlaying: state.isPlaying
    }
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.playbackRate.setValueAtTime(playbackRate, audioContextRef.current.currentTime)
    }
  }, [playbackRate])

  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioContextRef.current.currentTime)
    }
  }, [volume])

  useEffect(() => {
    if (!onControlsReady) return

    const controls: VideoPlayerControls = {
      getCurrentTime: getPlaybackTime,
      getDuration: () => durationRef.current,
      seek: seekAudio,
      play: () => {
        void playAudio()
      },
      pause: pauseAudio,
      seekForward: () => seekAudioBy(10),
      seekBackward: () => seekAudioBy(-10),
      setPlaybackRate: (rate: number) => {
        playbackRateRef.current = rate
        setPlaybackRate(rate)
      },
      getPlaybackRate: () => playbackRateRef.current,
      getVideoElement: () => null
    }
    onControlsReady(controls)
  }, [onControlsReady])

  const saveMetadata = async (updates: Partial<AudioMetadata>) => {
    try {
      await saveAudioMetadata(audioFile, updates, directoryHandle)
    } catch (error) {
      console.error('Error saving metadata:', error)
    }
  }

  const togglePlay = () => {
    if (isPlaying) {
      pauseAudio()
    } else {
      playAudio().catch(error => {
        console.error('AudioPlayer: Play failed:', error)
        setIsPlaying(false)
      })
    }
  }

  const handleTimeChange = (newTime: number[]) => {
    seekAudio(newTime[0])
  }

  const handlePlaybackRateChange = async (newRate: string) => {
    const rate = parseFloat(newRate)
    playbackRateRef.current = rate
    setPlaybackRate(rate)
    await saveMetadata({ playbackRate: rate })
  }

  const handleSyncLoopTime = (isStart: boolean) => {
    const newRegion = {
      ...loopRegion,
      [isStart ? 'start' : 'end']: roundToMilliseconds(getPlaybackTime())
    }
    setLoopRegion(newRegion)
    saveMetadata({ loopRegion: newRegion })
  }

  const handleLoopTimeChange = (isStart: boolean, timeStr: string) => {
    const timeInSeconds = parseTimeInput(timeStr)
    if (timeInSeconds === null) return
    if (timeInSeconds < 0 || timeInSeconds > duration) return

    const newRegion = {
      ...loopRegion,
      [isStart ? 'start' : 'end']: timeInSeconds
    }
    setLoopRegion(newRegion)
    saveMetadata({ loopRegion: newRegion })
  }

  const toggleLoopRegion = async () => {
    const newRegion = { ...loopRegion, enabled: !loopRegion.enabled }
    setLoopRegion(newRegion)
    await saveMetadata({ loopRegion: newRegion })
  }

  const handleTagsChange = async (newTags: string[]) => {
    setTags(newTags)
    await saveMetadata({ tags: newTags })
  }

  const parseTimeInput = (value: string): number | null => {
    const [minutesText, secondsText] = value.trim().split(':')
    const minutes = Number(minutesText)
    const seconds = Number(secondsText)

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return roundToMilliseconds(minutes * 60 + seconds)
  }

  const formatTime = (time: number) => {
    const totalMilliseconds = Math.round(time * 1000)
    const minutes = Math.floor(totalMilliseconds / 60000)
    const seconds = Math.floor((totalMilliseconds % 60000) / 1000)
    const milliseconds = totalMilliseconds % 1000

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
  }

  return (
    <div className="p-4 space-y-4">
      {/* Display audio title at the top */}
      <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium truncate">{audioFile.name}</h2>
          <FavoriteButton
            audio={audioFile}
            metadata={{
              id: audioFile.path,
              path: audioFile.path,
              tags,
              loopRegion,
              markers,
              annotations,
              playbackRate,
              volume
            }}
            directoryHandle={directoryHandle}
          />
        </div>
        {!inFloatingWindow && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openPlayer({
                type: 'audio',
                title: audioFile.name,
                audioFile,
                selectedMarkerId,
                onMarkerSelect,
                currentTime,
                isPlaying
              }, () => {
                // Pause main player when opening floating window
                if (playbackStateRef.current.isPlaying) {
                  pauseAudio()
                }
              })
            }}
            className="gap-2 ml-2 flex-shrink-0"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Window
          </Button>
        )}
      </div>
      
      {inFloatingWindow ? (
        <div className="space-y-3">
          {/* Control buttons row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlay}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => seekAudio(0)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => seekAudioBy(-5)}
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => seekAudioBy(5)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={playbackRate.toString()}
                onValueChange={handlePlaybackRateChange}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue>{playbackRate}x</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PLAYBACK_SPEEDS.map(speed => (
                    <SelectItem key={speed} value={speed.toString()}>
                      {speed}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="w-20">
                <Slider
                  value={[volume * 100]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(value) => {
                    const newVolume = value[0] / 100
                    setVolume(newVolume)
                    saveMetadata({ volume: newVolume })
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Progress bar row */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Slider
                value={[currentTime]}
                min={0}
                max={duration}
                step={0.001}
                onValueChange={handleTimeChange}
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => seekAudio(0)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => seekAudioBy(-5)}
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => seekAudioBy(5)}
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          <div className="flex-1">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration}
              step={0.001}
              onValueChange={handleTimeChange}
            />
          </div>

          <Select
            value={playbackRate.toString()}
            onValueChange={handlePlaybackRateChange}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue>{playbackRate}x</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PLAYBACK_SPEEDS.map(speed => (
                <SelectItem key={speed} value={speed.toString()}>
                  {speed}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-24">
            <Slider
              value={[volume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) => {
                const newVolume = value[0] / 100
                setVolume(newVolume)
                saveMetadata({ volume: newVolume })
              }}
              className="w-full"
            />
          </div>

          <span className="w-36 text-right text-sm text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Button
            variant={loopRegion.enabled ? "secondary" : "outline"}
            onClick={toggleLoopRegion}
            className="w-24"
          >
            <BringToFront className="h-4 w-4 mr-2" />
            Loop
          </Button>
          
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Start:</span>
              <input
                type="text"
                value={formatTime(loopRegion.start)}
                onChange={(e) => handleLoopTimeChange(true, e.target.value)}
                className="w-24 rounded-md border border-input/80 bg-gradient-to-b from-white to-muted/20 px-2 py-1 text-sm shadow-sm transition-[border-color,box-shadow] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:from-input/80 dark:to-input/40"
                placeholder="00:00.000"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSyncLoopTime(true)}
              >
                <Timer className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">End:</span>
              <input
                type="text"
                value={formatTime(loopRegion.end)}
                onChange={(e) => handleLoopTimeChange(false, e.target.value)}
                className="w-24 rounded-md border border-input/80 bg-gradient-to-b from-white to-muted/20 px-2 py-1 text-sm shadow-sm transition-[border-color,box-shadow] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:from-input/80 dark:to-input/40"
                placeholder="00:00.000"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSyncLoopTime(false)}
              >
                <Timer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AudioMarkers
        audioControls={{
          getCurrentTime: getPlaybackTime,
          getDuration: () => durationRef.current,
          seek: seekAudio,
          play: () => {
            void playAudio()
          }
        }}
        markers={markers}
        annotations={annotations}
        onMarkersChange={async (newMarkers) => {
          setMarkers(newMarkers)
          await saveMetadata({ markers: newMarkers })
        }}
        onAnnotationsChange={async (newAnnotations) => {
          setAnnotations(newAnnotations)
          await saveMetadata({ annotations: newAnnotations })
        }}
        externalActiveMarkerId={selectedMarkerId}
        onActiveMarkerIdChange={onMarkerSelect}
        className="mb-4"
      />

    </div>
  )
}
