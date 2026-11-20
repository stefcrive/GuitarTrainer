'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePlaybackStore } from '@/stores/playback-store'

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function PlaybackBar() {
  const active = usePlaybackStore((state) => state.active)
  const error = usePlaybackStore((state) => state.error)
  const [, refresh] = useState(0)
  const [seeking, setSeeking] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSeeking(null)
    const timer = window.setInterval(() => refresh((value) => value + 1), 250)
    return () => window.clearInterval(timer)
  }, [active])

  if (!active) return null
  const rawDuration = active.getDuration()
  const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0
  const rawTime = active.getCurrentTime()
  const currentTime = Math.min(duration, Math.max(0, Number.isFinite(rawTime) ? rawTime : 0))
  const playing = active.isPlaying()
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true)
    usePlaybackStore.getState().setError(null)
    try {
      await action()
    } catch (failure) {
      usePlaybackStore.getState().setError(failure instanceof Error ? failure.message : 'Playback failed. Try again.')
    } finally {
      setBusy(false)
      refresh((value) => value + 1)
    }
  }

  return (
    <footer aria-label="Now playing" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background px-3 py-2 md:left-[var(--app-sidebar-width)]">
      {error && <div role="alert" className="mb-1 truncate text-xs text-destructive" title={error}>{error}</div>}
      <div className="flex h-10 items-center gap-2 md:gap-3">
        <Link href={active.href} className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-w-64" title={active.title}>
          {active.title}
        </Link>
        <Button
          variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 sm:inline-flex"
          aria-label="Back 10 seconds" disabled={busy || !duration}
          onClick={() => void run(() => active.seek(Math.max(0, currentTime - 10)))}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="outline" size="icon" className="h-8 w-8 shrink-0"
          aria-label={playing ? 'Pause' : 'Play'} disabled={busy}
          onClick={() => void run(playing ? active.pause : active.play)}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 sm:inline-flex"
          aria-label="Forward 10 seconds" disabled={busy || !duration}
          onClick={() => void run(() => active.seek(Math.min(duration, currentTime + 10)))}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <Slider
          aria-label="Playback position" className="min-w-12 flex-1"
          min={0} max={duration || 1} step={0.1} value={[seeking ?? currentTime]}
          disabled={!duration || busy}
          onValueChange={([value]) => setSeeking(value)}
          onValueCommit={([value]) => {
            setSeeking(null)
            void run(() => active.seek(value))
          }}
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(seeking ?? currentTime)}
          <span className="hidden sm:inline"> / {formatTime(duration)}</span>
        </span>
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <Link href={active.href} aria-label="Return to practice" title="Return to practice">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </footer>
  )
}
