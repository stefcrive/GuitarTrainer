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

interface AudioPlayerProps {
  audioFile: AudioFile
  onControlsReady?: (controls: VideoPlayerControls) => void
  selectedMarkerId?: string | null
  onMarkerSelect?: (markerId: string | null) => void
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export function AudioPlayer({ audioFile, onControlsReady, selectedMarkerId, onMarkerSelect }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
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

  useEffect(() => {
    const loadAudio = async () => {
      if (!audioRef.current) return
      
      try {
        // Load audio file
        if (!audioFile.handle) {
          throw new Error("No file handle available")
        }
        const file = await audioFile.handle.getFile()
        const url = URL.createObjectURL(file)
        audioRef.current.src = url

        // Auto-play when loaded
        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsPlaying(true)
          }).catch(error => {
            console.error("Auto-play failed:", error)
          })
        }

        // Load metadata
        const metadata = await getAudioMetadata(audioFile, directoryHandle)
        setTags(metadata.tags)
        setPlaybackRate(metadata.playbackRate)
        setVolume(metadata.volume ?? 1)
        setLoopRegion(metadata.loopRegion)
        setMarkers(metadata.markers || [])
        setAnnotations(metadata.annotations || [])
        
        return () => {
          URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error('Error loading audio file:', error)
      }
    }

    loadAudio()
  }, [audioFile, directoryHandle])

  useEffect(() => {
    if (!audioRef.current) return

    const audio = audioRef.current
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)

      // Handle loop region
      if (loopRegion.enabled && audio.currentTime >= loopRegion.end) {
        audio.currentTime = loopRegion.start
      }

      // Handle marker looping
      const loopingMarker = markers.find(m => m.isLooping)
      if (loopingMarker && audio.currentTime >= loopingMarker.endTime) {
        audio.currentTime = loopingMarker.startTime
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setLoopRegion(prev => ({
        ...prev,
        end: prev.end || audio.duration
      }))
      audio.volume = volume

      // Once audio is loaded, expose controls
      if (onControlsReady) {
        const controls: VideoPlayerControls = {
          getCurrentTime: () => audio.currentTime,
          getDuration: () => audio.duration,
          seek: (time: number) => { audio.currentTime = time },
          play: () => audio.play(),
          pause: () => audio.pause(),
          seekForward: () => { audio.currentTime += 10 },
          seekBackward: () => { audio.currentTime -= 10 },
          setPlaybackRate: (rate: number) => { audio.playbackRate = rate },
          getPlaybackRate: () => audio.playbackRate,
          getVideoElement: () => null
        }
        onControlsReady(controls)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      if (loopRegion.enabled) {
        audio.currentTime = loopRegion.start
        audio.play()
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [loopRegion, markers])

  const saveMetadata = async (updates: Partial<AudioMetadata>) => {
    try {
      await saveAudioMetadata(audioFile, updates, directoryHandle)
    } catch (error) {
      console.error('Error saving metadata:', error)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeChange = (newTime: number[]) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = newTime[0]
    setCurrentTime(newTime[0])
  }

  const handlePlaybackRateChange = async (newRate: string) => {
    if (!audioRef.current) return
    const rate = parseFloat(newRate)
    audioRef.current.playbackRate = rate
    setPlaybackRate(rate)
    await saveMetadata({ playbackRate: rate })
  }

  const handleSyncLoopTime = (isStart: boolean) => {
    if (!audioRef.current) return
    const newRegion = {
      ...loopRegion,
      [isStart ? 'start' : 'end']: audioRef.current.currentTime
    }
    setLoopRegion(newRegion)
    saveMetadata({ loopRegion: newRegion })
  }

  const handleLoopTimeChange = (isStart: boolean, timeStr: string) => {
    const [minutes, seconds] = timeStr.split(':').map(Number)
    if (isNaN(minutes) || isNaN(seconds)) return
    
    const timeInSeconds = minutes * 60 + seconds
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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="p-4 space-y-4">
      <audio ref={audioRef} />
      
      {/* Display audio title at the top */}
      <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md">
        <h2 className="text-lg font-medium truncate">{audioFile.name}</h2>
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlay}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

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
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (audioRef.current) audioRef.current.currentTime = 0
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (audioRef.current) audioRef.current.currentTime -= 5
          }}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (audioRef.current) audioRef.current.currentTime += 5
          }}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <div className="flex-1">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration}
            step={0.1}
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
              if (audioRef.current) {
                audioRef.current.volume = newVolume
              }
              setVolume(newVolume)
              saveMetadata({ volume: newVolume })
            }}
            className="w-full"
          />
        </div>

        <span className="text-sm text-muted-foreground w-24 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

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
                className="w-16 text-sm border rounded px-2 py-1"
                placeholder="00:00"
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
                className="w-16 text-sm border rounded px-2 py-1"
                placeholder="00:00"
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
          getCurrentTime: () => audioRef.current?.currentTime || 0,
          getDuration: () => audioRef.current?.duration || 0,
          seek: (time: number) => {
            if (audioRef.current) audioRef.current.currentTime = time
          },
          play: () => audioRef.current?.play()
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