'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DocumentScore } from '@/types/document'
import type { DocumentReader } from '@/services/document-reader'
import { cropDocumentCanvas } from '@/services/document-reader'
import { scorePlayhead } from '@/lib/document-score-timing'

export function DocumentScoreSource({ score, reader, preview, position, playing, autoscroll, toolbarActions }: { score: DocumentScore; reader?: DocumentReader; preview?: string; position: number; playing: boolean; autoscroll: boolean; toolbarActions?: ReactNode }) {
  const head = scorePlayhead(score, position)
  const sources = score.sourcePages ?? []
  const [page, setPage] = useState(sources[0]?.page ?? 1)
  const [zoom, setZoom] = useState(100)
  const [image, setImage] = useState(preview)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imageReady, setImageReady] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const scrollKey = useRef('')
  const cache = useRef(new Map<string, string>())
  const displayedPage = playing && autoscroll && head ? head.page : page
  const source = sources.find(source => source.page === displayedPage)
  useEffect(() => {
    if (!reader?.pdf || !source) { setImage(preview); return }
    let cancelled = false
    const key = JSON.stringify(source)
    setError(''); setImageReady(false)
    const cached = cache.current.get(key)
    if (cached) { setImage(cached); setLoading(false); return }
    setLoading(true); setImage(undefined)
    void reader.render(source.page).then(canvas => {
      if (cancelled) return
      const url = cropDocumentCanvas(canvas, source.region).toDataURL('image/png')
      cache.current.set(key, url)
      if (cache.current.size > 3) cache.current.delete(cache.current.keys().next().value!)
      setImage(url)
    }).catch(error => { if (!cancelled) setError(error.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reader, source, preview])
  useEffect(() => {
    if (!playing || !autoscroll || !head || !marker.current || !viewport.current || !image || !imageReady) return
    const key = `${head.page}:${head.system}`
    const container = viewport.current, target = marker.current
    const y = target.offsetTop, h = target.offsetHeight
    if (key !== scrollKey.current || y < container.scrollTop || y + h > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: Math.max(0, y - container.clientHeight * 0.25), behavior: 'auto' }); scrollKey.current = key
    }
    if (target.offsetLeft < container.scrollLeft || target.offsetLeft > container.scrollLeft + container.clientWidth - 12) container.scrollLeft = Math.max(0, target.offsetLeft - container.clientWidth * 0.25)
  }, [head, image, imageReady, autoscroll, playing, zoom])
  if (!preview && !sources.length) return null
  return <div className="flex min-h-48 flex-1 flex-col rounded-md border">
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/25 px-2 py-1 text-xs">{sources.length > 1 && <label className="flex items-center gap-2">Source page<select aria-label="Source page" className="h-7 rounded border bg-background px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={displayedPage} disabled={playing && autoscroll} onChange={event => setPage(Number(event.target.value))}>{sources.map(source => <option key={source.page} value={source.page}>{source.page}</option>)}</select></label>}
      <div className="ml-auto flex items-center gap-3">{toolbarActions}<label className="flex items-center gap-1">Zoom<select aria-label="Notation zoom" className="h-7 rounded border bg-background px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[100, 150, 200, 300].map(value => <option key={value} value={value}>{value}%</option>)}</select></label></div>
    </div>
    <div ref={viewport} className="relative min-h-0 flex-1 overflow-auto rounded-b-md bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" role="region" tabIndex={0} aria-label="Source notation">
      {loading && <div role="status" className="p-2 text-xs text-slate-700">Loading notation...</div>}
      {error && <div role="alert" className="p-2 text-xs text-destructive">{error}</div>}
      {image && <div className="relative" style={{ width: `${zoom}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`Source notation, page ${displayedPage}`} className="block w-full" onLoad={() => { scrollKey.current = ''; setImageReady(true) }} />
        {head && head.page === displayedPage && <div ref={marker} aria-label="Notation playhead" className="pointer-events-none absolute w-0.5 bg-blue-600 shadow-[0_0_0_1px_white]" style={{ left: `${head.x * 100}%`, top: `${head.y * 100}%`, height: `${head.height * 100}%` }} />}
      </div>}
    </div>
  </div>
}
