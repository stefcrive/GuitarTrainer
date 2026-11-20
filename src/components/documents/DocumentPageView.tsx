'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { DocumentRegion } from '@/types/document'
import type { DocumentReader } from '@/services/document-reader'

export function DocumentPageView({ reader, page, zoom, selecting, region, onRegion, onCanvas, onError }: {
  reader: DocumentReader; page: number; zoom: number; selecting: boolean; region?: DocumentRegion
  onRegion: (region: DocumentRegion | undefined) => void; onCanvas: (canvas: HTMLCanvasElement | null) => void; onError: (message: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!(reader.pdf || reader.image)) return
    setRendering(true); onCanvas(null)
    reader.render(page).then(rendered => {
      if (cancelled || !canvas.current) return
      canvas.current.width = rendered.width; canvas.current.height = rendered.height
      canvas.current.getContext('2d')!.drawImage(rendered, 0, 0)
      onCanvas(canvas.current)
    }).catch(error => { if (!cancelled) onError(error.message) }).finally(() => { if (!cancelled) setRendering(false) })
    return () => { cancelled = true; onCanvas(null) }
  }, [reader, page, onCanvas, onError])
  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  return <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2 custom-scrollbar">
    {(reader.pdf || reader.image) ? <>
      {rendering && <div role="status" className="py-1 text-xs text-muted-foreground">Rendering page...</div>}
      <div className={`relative mx-auto bg-white shadow-sm ${selecting ? 'cursor-crosshair touch-none' : ''} ${rendering ? 'invisible' : ''}`} style={{ width: `${zoom}%` }}
        role="group" aria-label="PDF page. Use Select region to crop music, or Region coordinates for keyboard selection."
        onPointerDown={event => { if (!selecting || rendering) return; event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); onRegion(undefined) }}
        onPointerMove={event => { if (!start.current) return; const end = point(event); onRegion({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) }) }}
        onPointerUp={event => { if (!start.current) return; const end = point(event); const width = Math.abs(end.x - start.current.x), height = Math.abs(end.y - start.current.y); onRegion(width > 0.005 && height > 0.005 ? { x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width, height } : undefined); start.current = null }}
        onPointerCancel={() => { start.current = null; onRegion(undefined) }}>
        <canvas ref={canvas} className="block h-auto w-full" aria-label={`Document page ${page}`} />
        {region && <div className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/15" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
      </div>
    </> : <pre className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 text-sm leading-relaxed" style={{ fontSize: `${zoom / 100}em` }}>{reader.sections?.[page - 1]}</pre>}
  </div>
}
