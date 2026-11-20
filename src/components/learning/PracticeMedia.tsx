'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type ReactPlayerType from 'react-player'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePersistentPlayback } from '@/hooks/usePersistentPlayback'
import type { MarkerCatalogItem } from '@/services/marker-catalog'
import { PracticeAudio } from './PracticeAudio'
import { openPracticeFile } from './practice-file'
import { DocumentWorkspace } from '@/components/documents/DocumentWorkspace'

const ReactPlayer = dynamic(() => import('react-player/youtube'), { ssr: false })

export function PracticeMedia({ item }: { item: MarkerCatalogItem }) {
  if (item.contentType === 'book' && item.document) return <div className="h-[60vh] min-h-80 overflow-hidden rounded-md border"><DocumentWorkspace key={item.markerKey} entry={item.document} root={item.storage.handle} initialMarkerId={item.marker.id} /></div>
  return item.contentType === 'audio'
    ? <PracticeAudio key={JSON.stringify([item.markerKey, item.marker.startTime, item.marker.endTime])} item={item} />
    : <PracticeVideo item={item} />
}

function PracticeVideo({ item }: { item: MarkerCatalogItem }) {
  const media = useRef<HTMLMediaElement | null>(null)
  const youtube = useRef<ReactPlayerType | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [rate, setRate] = useState(1)
  const start = Math.max(0, item.marker.startTime || 0)
  const end = item.marker.endTime > start ? item.marker.endTime : undefined
  const isYoutube = item.contentType === 'youtube'
  const isSpotify = item.contentType === 'spotify'
  const seek = (time: number) => {
    if (isYoutube) youtube.current?.seekTo(time, 'seconds')
    else if (media.current) media.current.currentTime = time
  }
  const pause = () => { media.current?.pause(); setPlaying(false) }
  usePersistentPlayback({
    title: item.markerTitle,
    getCurrentTime: () => isYoutube ? youtube.current?.getCurrentTime() ?? 0 : media.current?.currentTime ?? 0,
    getDuration: () => isYoutube ? youtube.current?.getDuration() ?? 0 : media.current?.duration ?? 0,
    isPlaying: playing,
    play: async () => {
      if (isYoutube) setPlaying(true)
      else await media.current?.play()
    },
    pause,
    seek
  })

  useEffect(() => {
    if (isYoutube || isSpotify) return
    let cancelled = false
    let objectUrl: string | undefined
    const load = async () => {
      try {
        const file = await openPracticeFile(item)
        if (cancelled) return
        objectUrl = URL.createObjectURL(file)
        setUrl(objectUrl)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? `Unable to open media: ${err.message}` : 'Unable to open this media. Reconnect its library in Settings.')
      }
    }
    void load()
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item, isYoutube, isSpotify])

  useEffect(() => { if (media.current) media.current.playbackRate = rate }, [rate, url])
  useEffect(() => {
    if (!playing || isYoutube || end === undefined) return
    let frame = 0
    const tick = () => {
      const element = media.current
      if (element && !element.paused && element.currentTime >= end) {
        if (loop) element.currentTime = start
        else { element.pause(); element.currentTime = end }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, isYoutube, start, end, loop])
  const onPlay = () => {
    const current = isYoutube ? youtube.current?.getCurrentTime() : media.current?.currentTime
    if (current !== undefined && (current < start || (end !== undefined && current >= end))) seek(start)
    setPlaying(true)
  }
  const checkBoundary = (time: number) => {
    if (end !== undefined && time >= end) {
      if (loop) seek(start)
      else { pause(); seek(end) }
    }
  }
  if (isSpotify) {
    const raw = item.contentPath.replace(/^spotify:/, '').replace(/^spotify:/, '')
    const match = raw.match(/^(?:https:\/\/open\.spotify\.com\/)?(track|episode)[:/]([A-Za-z0-9]+)$/)
    return <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs">
      <span className="text-muted-foreground">Playback in Spotify</span>
      {match ? <Button asChild size="sm" variant="outline"><a href={`https://open.spotify.com/${match[1]}/${match[2]}`} target="_blank" rel="noreferrer">Open source<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <span role="alert">Spotify source unavailable</span>}
    </div>
  }
  return <div className="space-y-2">
    {error ? <div role="alert" className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">{error}</div> : isYoutube ? (
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        <ReactPlayer ref={youtube} url={`https://www.youtube.com/watch?v=${encodeURIComponent(item.contentPath.replace(/^youtube:/, ''))}`} width="100%" height="100%" controls playing={playing} playbackRate={rate} progressInterval={100}
          onReady={() => seek(start)} onPlay={onPlay} onPause={() => setPlaying(false)}
          onProgress={({ playedSeconds }) => { if (playing) checkBoundary(playedSeconds) }}
          onEnded={() => { if (loop) { seek(start); setPlaying(true) } else setPlaying(false) }}
          onError={() => setError('YouTube playback unavailable. Check your connection or the video permissions.')} />
      </div>
    ) : !url ? <div role="status" className="rounded-md border p-3 text-xs text-muted-foreground">Loading media...</div> : (
      <video ref={(node) => { media.current = node }} src={url} controls playsInline className="max-h-[45vh] w-full rounded-md bg-black" aria-label={item.markerTitle}
        onLoadedMetadata={() => seek(start)} onPlay={onPlay} onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => { if (!event.currentTarget.paused) checkBoundary(event.currentTarget.currentTime) }}
        onEnded={() => { if (loop) { seek(start); void media.current?.play().catch(() => setError('Unable to restart video. Press play to resume.')) } }}
        onError={() => setError('This video format could not be played.')} />
    )}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={Boolean(error) || (!isYoutube && !url)} onClick={() => seek(start)}><RotateCcw className="h-3.5 w-3.5" />Marker start</Button>
      <label className="flex h-8 items-center gap-2"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />Loop marker</label>
      <label className="flex h-8 items-center gap-2">Speed<select aria-label="Playback speed" value={rate} onChange={(event) => setRate(Number(event.target.value))} className="h-8 rounded-md border bg-background px-2">
        {[0.5, 0.6, 0.75, 0.85, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}
      </select></label>
    </div>
  </div>
}
