'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDirectoryStore } from '@/stores/directory-store'
import { markersService } from '@/services/markers'
import { mergeYouTubeGeneratedMarkers } from '@/lib/youtube-generated-markers'
import type { VideoMarkerState } from '@/types/video'
import { MarkerGenerationDialog } from '@/components/video/MarkerGenerationDialog'
import { defaultMarkerOptions, type MarkerGenerationOptions } from '@/lib/marker-generation-options'

type Props = {
  videoId: string
  duration: number
  title?: string
  markerState: VideoMarkerState
  onGenerated: (state: VideoMarkerState) => Promise<void>
}

export function YouTubeMarkerGeneration({ videoId, duration, title, markerState, onGenerated }: Props) {
  const rootHandle = useDirectoryStore(state => state.rootHandle)
  const [jobId, setJobId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const latest = useRef({ markerState, onGenerated })
  latest.current = { markerState, onGenerated }
  const mounted = useRef(true)
  const storageKey = `youtube-marker-job:${videoId}`

  useEffect(() => {
    mounted.current = true
    const saved = sessionStorage.getItem(storageKey)
    if (saved) { setJobId(saved); setBusy(true) }
    return () => { mounted.current = false }
  }, [storageKey])

  useEffect(() => {
    if (!jobId || !busy || !rootHandle) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let failures = 0
    const poll = async () => {
      try {
        const response = await fetch(`/api/automatic-marker-generation?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
        const payload = await response.json()
        if (cancelled) return
        if (!response.ok) {
          if (response.status === 404) {
            sessionStorage.removeItem(storageKey)
            setJobId(null)
            setBusy(false)
            setError(payload.error || 'This generation job is no longer available. Retry generation.')
            return
          }
          throw new Error(payload.error || 'Unable to read marker generation progress.')
        }
        const job = payload.job
        if (job.videoPath !== `youtube:${videoId}`) throw new Error('The generated markers belong to another video.')
        setMessage(job.phase)
        if (job.status === 'failed') {
          sessionStorage.removeItem(storageKey)
          setJobId(null)
          setBusy(false)
          setError(job.error || 'YouTube marker generation failed.')
          return
        }
        if (job.status === 'completed') {
          const generated = job.result as VideoMarkerState | undefined
          if (!generated?.markers?.length || !Array.isArray(generated.annotations)) throw new Error('No generated markers were returned.')
          const merged = mergeYouTubeGeneratedMarkers(latest.current.markerState, generated, videoId)
          await markersService.saveMarkers(rootHandle, `youtube:${videoId}`, merged)
          if (cancelled) return
          await latest.current.onGenerated(merged)
          if (cancelled) return
          sessionStorage.removeItem(storageKey)
          setJobId(null)
          setBusy(false)
          setMessage(`Generated ${generated.markers.length} teaching-unit markers.`)
          return
        }
        failures = 0
        timer = setTimeout(poll, 2000)
      } catch (error) {
        if (cancelled) return
        if (++failures < 3) { timer = setTimeout(poll, 2000); return }
        setBusy(false)
        setError(error instanceof Error ? error.message : 'Unable to generate markers.')
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [jobId, busy, rootHandle, storageKey, videoId])

  const generate = async (options: MarkerGenerationOptions) => {
    setError('')
    setMessage('Starting generation...')
    setBusy(true)
    if (jobId) return // Resume polling; do not launch a duplicate job after a network/save failure.
    try {
      const response = await fetch('/api/automatic-marker-generation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeVideoId: videoId, duration, title, options })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to start YouTube marker generation.')
      sessionStorage.setItem(storageKey, payload.jobId)
      if (mounted.current) setJobId(payload.jobId)
    } catch (error) {
      if (!mounted.current) return
      setBusy(false)
      setError(error instanceof Error ? error.message : 'Unable to start generation.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <Button variant="outline" size="sm" disabled={busy || !rootHandle || duration <= 0}
        onClick={() => jobId ? void generate(defaultMarkerOptions) : setDialogOpen(true)} className="gap-2">
        <Sparkles className="h-4 w-4" />
        {busy ? 'Generating...' : jobId ? 'Resume marker generation' : 'Automatic marker generation'}
      </Button>
      <MarkerGenerationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} youtube
        onGenerate={options => void generate(options)} />
      {!rootHandle && <span className="text-xs text-muted-foreground">Select a video root in Settings to save markers.</span>}
      {error ? <span role="alert" className="text-xs text-destructive break-words">{error}</span>
        : message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
    </div>
  )
}
