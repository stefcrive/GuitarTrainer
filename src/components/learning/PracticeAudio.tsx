'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePersistentPlayback } from '@/hooks/usePersistentPlayback'
import type { MarkerCatalogItem } from '@/services/marker-catalog'
import { openPracticeFile } from './practice-file'

type AudioTrack = {
  context: AudioContext
  buffer: AudioBuffer
  gain: GainNode
  start: number
  end: number
}

type AudioRun = {
  node: AudioBufferSourceNode
  startedAt: number
  offset: number
  rate: number
  loop: boolean
}

function formatTime(time: number) {
  const seconds = Math.floor(time)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function PracticeAudio({ item }: { item: MarkerCatalogItem }) {
  const [track, setTrack] = useState<AudioTrack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [loop, setLoop] = useState(true)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const previousVolume = useRef(1)
  const run = useRef<AudioRun | null>(null)
  const offset = useRef(0)

  useEffect(() => {
    let cancelled = false
    let context: AudioContext | undefined
    const load = async () => {
      try {
        const file = await openPracticeFile(item)
        const bytes = await file.arrayBuffer()
        if (cancelled) return
        context = new AudioContext()
        const buffer = await context.decodeAudioData(bytes)
        if (cancelled) return
        const start = Math.max(0, item.marker.startTime || 0)
        const end = item.marker.endTime > start ? Math.min(item.marker.endTime, buffer.duration) : buffer.duration
        if (end <= start) throw new Error('This marker starts after the audio ends.')
        const gain = context.createGain()
        gain.connect(context.destination)
        offset.current = start
        setPosition(start)
        setTrack({ context, buffer, gain, start, end })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? `Unable to open audio: ${err.message}` : 'Unable to open audio.')
      }
    }
    void load()
    return () => {
      cancelled = true
      stopRun()
      if (context) void context.close()
    }
    // The parent remounts this player when the selected audio or its bounds change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopRun() {
    const active = run.current
    run.current = null
    if (!active) return
    active.node.onended = null
    active.node.stop()
    active.node.disconnect()
  }

  function getCurrentTime() {
    const active = run.current
    if (!track || !active) return offset.current
    const time = active.offset + (track.context.currentTime - active.startedAt) * active.rate
    return active.loop
      ? track.start + ((time - track.start) % (track.end - track.start))
      : Math.min(time, track.end)
  }

  function updatePosition(time: number) {
    offset.current = time
    setPosition(time)
  }

  function startRun(time: number, repeat = loop, speed = rate) {
    if (!track) return
    stopRun()
    const start = time >= track.end ? track.start : time
    const node = track.context.createBufferSource()
    node.buffer = track.buffer
    node.playbackRate.value = speed
    node.loop = repeat
    node.loopStart = track.start
    node.loopEnd = track.end
    node.connect(track.gain)
    node.onended = () => {
      if (run.current?.node !== node) return
      run.current = null
      node.disconnect()
      updatePosition(track.end)
      setPlaying(false)
    }
    const startedAt = track.context.currentTime
    run.current = { node, startedAt, offset: start, rate: speed, loop: repeat }
    updatePosition(start)
    if (repeat) node.start(startedAt, start)
    else node.start(startedAt, start, track.end - start)
    setPlaying(true)
    return node
  }

  async function play() {
    if (!track || playing) return
    setError(null)
    const node = startRun(offset.current)
    try {
      await track.context.resume()
    } catch {
      if (run.current?.node !== node) return
      pause()
      setError('Unable to play audio. Press play to retry.')
    }
  }

  function pause() {
    updatePosition(getCurrentTime())
    stopRun()
    setPlaying(false)
  }

  function seek(time: number) {
    if (!track || !Number.isFinite(time)) return
    const next = Math.max(track.start, Math.min(time, track.end))
    if (run.current && next < track.end) startRun(next)
    else {
      stopRun()
      updatePosition(next)
      setPlaying(false)
    }
  }

  usePersistentPlayback({
    title: item.markerTitle,
    getCurrentTime,
    getDuration: () => track?.buffer.duration ?? 0,
    isPlaying: playing,
    play,
    pause,
    seek
  })

  useEffect(() => {
    if (!playing || !track) return
    let frame: number
    const tick = () => {
      setPosition(getCurrentTime())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // The display reads the active source from a ref, including rate and loop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, track])

  return <div className="space-y-2">
    {error && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">{error}</div>}
    {!track ? !error && <div role="status" className="rounded-md border p-3 text-xs text-muted-foreground">Loading media...</div> : (
      <div role="group" aria-label={item.markerTitle} className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs">
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" aria-label={playing ? 'Pause' : 'Play'} onClick={() => playing ? pause() : void play()}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="shrink-0 tabular-nums">{formatTime(position)} / {formatTime(track.buffer.duration)}</span>
        <Slider className="min-w-12 flex-1" aria-label="Playback position" min={track.start} max={track.end} step={0.001} value={[position]} onValueChange={([time]) => seek(time)} />
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => {
          const next = volume === 0 ? previousVolume.current : 0
          track.gain.gain.value = next
          setVolume(next)
        }}>{volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</Button>
        <Slider className="w-12 shrink-0" aria-label="Volume" min={0} max={1} step={0.01} value={[volume]} onValueChange={([next]) => {
          if (next > 0) previousVolume.current = next
          track.gain.gain.value = next
          setVolume(next)
        }} />
      </div>
    )}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!track} onClick={() => { if (track) seek(track.start) }}><RotateCcw className="h-3.5 w-3.5" />Marker start</Button>
      <label className="flex h-8 items-center gap-2"><input type="checkbox" checked={loop} onChange={(event) => {
        const next = event.target.checked
        setLoop(next)
        if (run.current) startRun(getCurrentTime(), next)
      }} />Loop marker</label>
      <label className="flex h-8 items-center gap-2">Speed<select aria-label="Playback speed" value={rate} className="h-8 rounded-md border bg-background px-2" onChange={(event) => {
        const next = Number(event.target.value)
        setRate(next)
        if (run.current) startRun(getCurrentTime(), loop, next)
      }}>
        {[0.5, 0.6, 0.75, 0.85, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}
      </select></label>
    </div>
  </div>
}
