'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { DocumentDialog } from './DocumentDialog'

export interface NotationOptions { scope: 'selection' | 'page' | 'range'; from: number; to: number; beats: number; beatType: number; engine?: 'audiveris' | 'gpt'; image?: string }
export function DocumentNotationDialog({ page, pages, selection, preview, onRead, onClose }: { page: number; pages: number; selection: boolean; preview?: string; onRead: (options: NotationOptions) => void; onClose: () => void }) {
  const [engine, setEngine] = useState<'audiveris' | 'gpt'>('audiveris')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [uploaded, setUploaded] = useState<string>()
  const [imageError, setImageError] = useState('')
  useEffect(() => { fetch('/api/documents/recognize').then(r => r.json()).then(result => setConfigured(Boolean(result.gptConfigured))).catch(() => {}) }, [])
  const [scope, setScope] = useState<NotationOptions['scope']>(selection ? 'selection' : 'page')
  const [from, setFrom] = useState(page), [to, setTo] = useState(page)
  const [beats, setBeats] = useState(4), [beatType, setBeatType] = useState(4)
  const valid = scope !== 'range' || Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= pages
  return <DocumentDialog title="Read notation" onClose={onClose}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><label>Reader<select aria-label="Notation reader" disabled={Boolean(uploaded)} className="ml-2 h-8 rounded-md border bg-background px-2" value={engine} onChange={event => setEngine(event.target.value as typeof engine)}><option value="audiveris">Audiveris (local)</option><option value="gpt">GPT-6 Astra (OpenAI)</option></select></label><MarkerHelp label="GPT receives the unmodified captured image and returns structured notes, rhythm, meter, and positions. The app validates it and generates MusicXML for playback. API charges apply." />{engine === 'gpt' && <span>Sends image to OpenAI</span>}{engine === 'gpt' && configured === false && <a className="underline text-destructive" href="/settings">Add OpenAI key in Settings</a>}</div>
    <div className="mb-2 flex items-center gap-2 text-xs"><label className="cursor-pointer rounded border px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">Upload screenshot<input aria-label="Upload notation screenshot" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return
      setImageError('')
      try {
        if (file.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.')
        const bitmap = await createImageBitmap(file)
        try {
          if (bitmap.width * bitmap.height > 16_000_000) throw new Error('Choose an image smaller than 16 megapixels.')
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
          const png = canvas.toDataURL('image/png'); if (png.length > 16_000_000) throw new Error('The converted image exceeds 12 MB. Crop it before uploading.')
          setUploaded(png); setEngine('gpt'); setScope('page')
        } finally { bitmap.close() }
      } catch (error) { setImageError(error instanceof Error ? error.message : 'Cannot read image.') }
      event.target.value = ''
    }} /></label>{uploaded && <Button size="sm" variant="ghost" onClick={() => setUploaded(undefined)}>Use document</Button>}{imageError && <span role="alert" className="text-destructive">{imageError}</span>}</div>
    {(uploaded || preview && scope === 'selection') && <div className="mb-3 max-h-48 overflow-auto rounded border bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={uploaded || preview} alt="Image of selected notation to recognize" className="w-full" /></div>}
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label>Capture<select disabled={Boolean(uploaded)} className="ml-2 h-8 rounded-md border bg-background px-2" value={uploaded ? 'image' : scope} onChange={event => setScope(event.target.value as NotationOptions['scope'])}>
        {uploaded && <option value="image">Uploaded screenshot</option>}
        <option value="selection" disabled={!selection}>Selected region</option><option value="page">Entire page</option><option value="range">Multiple pages</option>
      </select></label>
      <MarkerHelp label="Five-line notation is read after masking six-line TAB and normalizing staff size and scan tilt. Include clefs and keys. Pages are read in order; check the draft before playback." />
      {scope === 'range' && <><label className="flex items-center gap-1">From<Input className="h-8 w-20" aria-label="Read from page" type="number" min={1} max={pages} value={from} onChange={event => setFrom(Number(event.target.value))} /></label><label className="flex items-center gap-1">To<Input className="h-8 w-20" aria-label="Read to page" type="number" min={from} max={pages} value={to} onChange={event => setTo(Number(event.target.value))} /></label><Button size="sm" variant="ghost" onClick={() => { setFrom(1); setTo(pages) }}>All pages</Button></>}
    </div>
    <div className="my-3 flex items-center gap-2 text-xs"><label className="flex items-center gap-1">Fallback meter<Input aria-label="Fallback beats" className="h-8 w-16" type="number" min={1} max={32} value={beats} onChange={event => setBeats(Number(event.target.value))} /></label><span>/</span><select aria-label="Fallback beat unit" className="h-8 rounded-md border bg-background px-2" value={beatType} onChange={event => setBeatType(Number(event.target.value))}>{[2, 4, 8, 16].map(unit => <option key={unit}>{unit}</option>)}</select><MarkerHelp label="Use the recognized meter first, then the preceding page's meter or consistent measure lengths. Otherwise assume this meter. The player labels assumptions and does not force note durations to fit." /></div>
    {!valid && <div role="alert" className="mb-2 text-xs text-destructive">Choose a valid page range.</div>}
    <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={engine === 'gpt' && configured === false || !valid || !Number.isInteger(beats) || beats < 1 || beats > 32} onClick={() => onRead({ image: uploaded, engine: uploaded ? 'gpt' : engine, scope, from: scope === 'range' ? from : page, to: scope === 'range' ? to : page, beats, beatType })}>Recognize notation</Button></div>
  </DocumentDialog>
}
