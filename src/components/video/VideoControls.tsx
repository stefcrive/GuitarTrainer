'use client'

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Timer
} from "lucide-react"
import type { VideoPlayerControls } from '@/types/video'

interface VideoControlsProps {
  controls: VideoPlayerControls
  onPrevVideo?: () => void
  onNextVideo?: () => void
  onAddMarker?: () => void
}

export function VideoControls({
  controls,
  onPrevVideo,
  onNextVideo,
  onAddMarker
}: VideoControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [skipSeconds, setSkipSeconds] = useState("10")
  const [playbackRate, setPlaybackRate] = useState("1.0")

  const togglePlayPause = () => {
    if (isPlaying) {
      controls.pause()
    } else {
      controls.play()
    }
    setIsPlaying(!isPlaying)
  }

  useEffect(() => {
    const video = document.querySelector('video')
    if (!video) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])
  const skipBackward = () => {
    const currentTime = controls.getCurrentTime()
    controls.seek(Math.max(currentTime - parseInt(skipSeconds), 0))
  }

  const skipForward = () => {
    const currentTime = controls.getCurrentTime()
    const duration = controls.getDuration()
    controls.seek(Math.min(currentTime + parseInt(skipSeconds), duration))
  }

  useEffect(() => {
    const rate = controls.getPlaybackRate()
    setPlaybackRate(rate.toString())
  }, [controls])

  const handlePlaybackRateChange = (value: string) => {
    const rate = parseFloat(value)
    controls.setPlaybackRate(rate)
    setPlaybackRate(value)
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {onAddMarker && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddMarker}
          title="Add marker at current time"
        >
          Add Marker
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <Select value={playbackRate} onValueChange={handlePlaybackRateChange}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.25">0.25x</SelectItem>
            <SelectItem value="0.5">0.5x</SelectItem>
            <SelectItem value="0.75">0.75x</SelectItem>
            <SelectItem value="1.0">1.0x</SelectItem>
            <SelectItem value="1.25">1.25x</SelectItem>
            <SelectItem value="1.5">1.5x</SelectItem>
            <SelectItem value="1.75">1.75x</SelectItem>
            <SelectItem value="2.0">2.0x</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Select value={skipSeconds} onValueChange={setSkipSeconds}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="5">5s</SelectItem>
          <SelectItem value="10">10s</SelectItem>
          <SelectItem value="15">15s</SelectItem>
          <SelectItem value="30">30s</SelectItem>
        </SelectContent>
      </Select>
      {onPrevVideo && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevVideo}
          title="Previous video"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      )}
      
      <Button
        variant="ghost"
        size="icon"
        onClick={skipBackward}
        title={`Skip ${skipSeconds} seconds backward`}
      >
        <SkipBack className="h-6 w-6" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-6 w-6" />
        ) : (
          <Play className="h-6 w-6" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={skipForward}
        title={`Skip ${skipSeconds} seconds forward`}
      >
        <SkipForward className="h-6 w-6" />
      </Button>

      {onNextVideo && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextVideo}
          title="Next video"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      )}
    </div>
  )
}