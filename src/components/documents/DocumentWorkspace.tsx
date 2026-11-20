'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookmarkPlus, ChevronLeft, ChevronRight, Crop, Edit2, Music, Play, ScanLine, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { loadDocumentState, saveDocumentState } from '@/services/documents'
import { canvasBlob, cropDocumentCanvas, openDocument, type DocumentReader } from '@/services/document-reader'
import { createDocumentOcr, ocrText, recognizeTab } from '@/services/document-ocr'
import { extractMarkerCandidates, markerFromCandidate, mergeDocumentMarkers, uniqueCandidates } from '@/lib/document-markers'
import { detectStaves } from '@/lib/document-staves'
import { prepareNotation, recoverNotationSystems } from '@/services/document-notation'
import { combineDocumentScores, resolveScoreMeter } from '@/lib/document-score-timing'
import { DocumentNotationDialog, type NotationOptions } from './DocumentNotationDialog'
import { emptyScore, parseTextTab } from '@/lib/document-score'
import type { DocumentMarker, DocumentRegion, DocumentScore, DocumentState, LibraryDocument, MarkerCandidate } from '@/types/document'
import { DocumentPageView } from './DocumentPageView'
import { DocumentMarkerEditor } from './DocumentMarkerEditor'
import { DocumentScorePlayer } from './DocumentScorePlayer'
import { DocumentGenerationDialog, type DocumentGenerationOptions } from './DocumentGenerationDialog'
import { DocumentMarkerReview } from './DocumentMarkerReview'
import { DocumentDialog } from './DocumentDialog'

export function DocumentWorkspace({ entry, root, initialMarkerId, markersPanel, hideMarkers = false }: { entry: LibraryDocument; root: FileSystemDirectoryHandle; initialMarkerId?: string; markersPanel?: ReactNode; hideMarkers?: boolean }) {
  const [reader, setReader] = useState<DocumentReader | null>(null)
  const [state, setState] = useState<DocumentState | null>(null)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [selecting, setSelecting] = useState(false)
  const [region, setRegion] = useState<DocumentRegion>()
  const [coordinates, setCoordinates] = useState(false)
  const [editing, setEditing] = useState<DocumentMarker>()
  const [generation, setGeneration] = useState(false)
  const [notationDialog, setNotationDialog] = useState(false)
  const [candidates, setCandidates] = useState<DocumentMarker[]>()
  const [player, setPlayer] = useState<{ marker: DocumentMarker; score: DocumentScore; preview?: string }>()
  const [deleting, setDeleting] = useState<DocumentMarker>()
  const [omrAvailable, setOmrAvailable] = useState<boolean | null>(null)
  const controller = useRef<AbortController>()
  const rendered = useRef<HTMLCanvasElement | null>(null)
  const selectedText = useRef('')
  const current = useRef(state)
  current.current = state
  const page = state?.page ?? 1
  const focusedMarker = state?.markers.find(marker => marker.id === initialMarkerId)
  const onCanvas = useCallback((canvas: HTMLCanvasElement | null) => { rendered.current = canvas }, [])

  useEffect(() => {
    let disposed = false
    let opened: DocumentReader | undefined
    async function load() {
      try {
        const file = await entry.handle.getFile()
        const saved = await loadDocumentState(root, entry.path)
        if (disposed) return
        opened = await openDocument(entry)
        if (disposed) { await opened.close(); return }
        const fingerprint = `${file.size}:${file.lastModified}`
        if (saved && saved.fingerprint !== fingerprint) setError('This document changed since markers were saved. Check their page positions.')
        const target = saved?.markers.find(marker => marker.id === initialMarkerId)
        if (target) setRegion(target.region)
        setState({ version: 1, fingerprint, page: Math.min(opened.pages, Math.max(1, target?.page ?? saved?.page ?? 1)), markers: saved?.markers ?? [], ocrPages: saved?.fingerprint === fingerprint ? saved.ocrPages : undefined })
        setReader(opened)
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : 'Unable to open document.') }
    }
    void load()
    fetch('/api/documents/recognize').then(response => response.json()).then(result => { if (!disposed) setOmrAvailable(result.available) }).catch(() => {})
    return () => { disposed = true; controller.current?.abort(); if (opened) void opened.close() }
  }, [entry, root, initialMarkerId])

  const persist = useCallback((next: DocumentState) => {
    setState(next)
    current.current = next
    const saving = saveDocumentState(root, entry.path, next)
    void saving.then(() => setSaveError('')).catch(error => setSaveError(`Markers could not be saved: ${error.message}`))
    return saving
  }, [root, entry.path])

  function upsert(marker: DocumentMarker) {
    const latest = current.current
    if (!latest) return
    return persist({ ...latest, markers: latest.markers.some(item => item.id === marker.id) ? latest.markers.map(item => item.id === marker.id ? marker : item) : [...latest.markers, marker].sort((a, b) => a.page - b.page) })
  }
  function newMarker(kind: DocumentMarker['kind'] = 'note', selected = region): DocumentMarker {
    return { id: crypto.randomUUID(), title: `${kind === 'tab' ? 'TAB' : kind === 'notation' ? 'Notation' : 'Page'} ${page}`, page, endPage: page, kind, notes: '', tags: [], completionDegree: 0, origin: 'manual', region: selected }
  }
  function goTo(next: number, selected?: DocumentRegion) {
    if (!state || !reader || !Number.isInteger(next) || next < 1 || next > reader.pages) return
    setRegion(selected); persist({ ...state, page: next })
  }

  async function generate(options: DocumentGenerationOptions) {
    if (!reader || !state || busy) return
    setGeneration(false); setBusy(true); setError('')
    const abort = new AbortController(); controller.current = abort
    const textCandidates: MarkerCandidate[] = [], musicCandidates: DocumentMarker[] = []
    const ocrPages = { ...state.ocrPages }
    let ocr: Awaited<ReturnType<typeof createDocumentOcr>> | undefined
    try {
      textCandidates.push(...(await reader.outline()).filter(item => item.page >= options.from && item.page <= options.to))
      for (let index = options.from; index <= options.to; index++) {
        abort.signal.throwIfAborted()
        setStatus(`Scanning ${index} / ${options.to}`)
        let text = await reader.text(index)
        let canvas: HTMLCanvasElement | undefined
        const needsOcr = options.ocr && text.replace(/\s/g, '').length < 20
        if ((reader.pdf || reader.image) && (options.music || (needsOcr && ocrPages[index] === undefined))) canvas = await reader.render(index)
        if (needsOcr && ocrPages[index] !== undefined) text = ocrPages[index]
        else if (canvas && needsOcr) {
          setStatus(`OCR ${index} / ${options.to}`)
          if (!ocr) ocr = await createDocumentOcr(abort.signal)
          text = ocrText(await ocr.recognize(canvas))
          ocrPages[index] = text
        }
        textCandidates.push(...extractMarkerCandidates(text, index, reader.pages, options.offset))
        if (canvas && options.music) {
          const staves = detectStaves(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height))
          staves.forEach((staff, staffIndex) => musicCandidates.push({ ...newMarker(staff.kind, staff.region), page: index, endPage: index,
            title: `${staff.kind === 'tab' ? 'TAB' : 'Notation'} ${index}.${staffIndex + 1}`, origin: 'detection' }))
        }
        // Yield between pages so progress and cancellation remain responsive.
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'Document scanning failed.')
    } finally {
      ocr?.dispose()
      if (current.current) persist({ ...current.current, ocrPages })
      const all = [...uniqueCandidates(textCandidates).map(markerFromCandidate), ...musicCandidates].sort((a, b) => a.page - b.page)
      const existing = new Set(current.current?.markers.map(marker => `${marker.page}:${marker.title.toLowerCase()}`))
      const fresh = all.filter(marker => !existing.has(`${marker.page}:${marker.title.toLowerCase()}`))
      setCandidates(fresh.length ? fresh : undefined)
      setStatus(`${abort.signal.aborted ? 'Cancelled. ' : ''}${fresh.length} new candidates${fresh.length ? ' ready for review.' : '. Try a different range, index offset, or manual markers.'}`)
      setBusy(false); controller.current = undefined
    }
  }

  async function recognize(kind: 'notation' | 'tab', existing?: DocumentMarker, manual = false, options?: NotationOptions) {
    if (!reader || busy) return
    const marker = existing ?? newMarker(kind, options && options.scope !== 'selection' ? undefined : region)
    if (options) { marker.page = options.from; marker.endPage = options.to; if (options.scope !== 'selection') marker.region = undefined }
    setNotationDialog(false)
    setBusy(true); setError(''); setStatus(manual ? 'Opening score...' : `Recognizing ${kind === 'tab' ? 'TAB' : 'notation'}...`)
    const abort = new AbortController(); controller.current = abort
    let ocr: Awaited<ReturnType<typeof createDocumentOcr>> | undefined
    const completed: DocumentScore[] = []
    let preview: string | undefined
    try {
      let canvas: HTMLCanvasElement | undefined
      if (options?.image) {
        const image = new Image(); image.src = options.image; await image.decode()
        canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')!.drawImage(image, 0, 0)
        preview = options.image
      } else if ((reader.pdf || reader.image)) {
        canvas = cropDocumentCanvas(marker.page === page && rendered.current ? rendered.current : await reader.render(marker.page), marker.region)
        preview = canvas.toDataURL('image/png')
      }
      abort.signal.throwIfAborted()
      let score: DocumentScore
      if (existing?.score) { if (existing.score.sourceImage) preview = existing.score.sourceImage; score = existing.score.source === 'audiveris' ? resolveScoreMeter(existing.score, { beats: 4, beatType: 4 }) : existing.score }
      else if (manual) score = reader.score ?? emptyScore()
      else if (kind === 'tab') {
        if (canvas) { ocr = await createDocumentOcr(abort.signal); score = await recognizeTab(canvas, ocr) }
        else score = parseTextTab(selectedText.current || await reader.text(marker.page))
      } else if (canvas) {
        let previous: { beats: number; beatType: number } | undefined
        for (let sourcePage = marker.page; sourcePage <= marker.endPage; sourcePage++) {
          abort.signal.throwIfAborted()
          setStatus(`Reading notation ${sourcePage} / ${marker.endPage}`)
          const source = sourcePage === marker.page ? canvas : cropDocumentCanvas(await reader.render(sourcePage), marker.region)
          if (options?.engine === 'gpt') {
            setStatus(`Page ${sourcePage}: transcribing with GPT-6 Astra...`)
            const response = await fetch('/api/documents/recognize?engine=gpt', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: await canvasBlob(source), signal: abort.signal })
            const result = await response.json()
            if (!response.ok || !result.scores?.length) throw new Error(result.error || 'GPT returned no score.')
            for (const draft of result.scores as DocumentScore[]) {
              const withPage = (position: NonNullable<DocumentScore['notes'][number]['position']>) => ({ ...position, page: options?.image ? 1 : sourcePage })
              completed.push({ ...draft, sourceImage: options?.image, sourcePages: options?.image ? undefined : [{ page: sourcePage, region: marker.region }], notes: draft.notes.map(note => ({ ...note, position: note.position && withPage(note.position) })), measures: draft.measures.map(measure => ({ ...measure, position: measure.position && withPage(measure.position) })) })
            }
            continue
          }
          let prepared = prepareNotation(source)
          let sourceRegion = marker.region
          let recovered = false
          let alreadyMapped = false
          let scores: DocumentScore[] = []
          for (let attempt = 0; attempt < 3; attempt++) {
            abort.signal.throwIfAborted()
            if (attempt > 0) {
              setStatus(`Page ${sourcePage}: retrying captured ${marker.region ? 'region' : 'page'} ${attempt === 1 ? 'at higher resolution' : 'without staff masking'}...`)
              prepared = prepareNotation(cropDocumentCanvas(await reader.render(sourcePage, attempt === 1 ? 3 : 2), marker.region), attempt === 1, attempt === 1 ? 28 : 20)
            }
            const response = await fetch('/api/documents/recognize', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: await canvasBlob(prepared.canvas), signal: abort.signal })
            const result = await response.json()
            if (response.ok && result.scores?.length) {
              const missing = prepared.missingStaves(result.scores)
              scores = result.scores
              if (missing.length) scores.forEach(draft => {
                draft.coverageWarning = `Partial or uncertain reading: notation row(s) ${missing.join(', ')} could not be matched. Try GPT vision or a tighter selection.`
                draft.warnings.push(draft.coverageWarning)
              })
              recovered = attempt > 0; break
            }
            if (response.status === 422 && attempt === 2) {
              scores = await recoverNotationSystems(source, sourcePage, abort.signal, setStatus)
              alreadyMapped = true; recovered = true; break
            }
            if (response.status !== 422) throw new Error(`Page ${sourcePage}: ${result.error || 'No usable music was produced.'}`)
          }
          for (const draft of scores) {
            const resolved = resolveScoreMeter(alreadyMapped ? draft : prepared.mapScore(draft, sourcePage), { beats: options?.beats ?? 4, beatType: options?.beatType ?? 4 }, previous)
            resolved.sourcePages = [{ page: sourcePage, region: sourceRegion }]
            if (recovered) resolved.warnings.push(`Page ${sourcePage}: recovered within the captured region${prepared.removedTabs ? '' : ' without staff masking'}.`)
            if (prepared.removedTabs) resolved.warnings.push(`Page ${sourcePage}: ${prepared.removedTabs} six-line TAB bands excluded.`)
            completed.push(resolved)
            const last = resolved.measures.at(-1)
            previous = { beats: last?.beats || resolved.beats!, beatType: last?.beatType || resolved.beatType! }
          }
        }
        score = combineDocumentScores(completed)
      } else score = reader.score ?? emptyScore()
      abort.signal.throwIfAborted()
      setPlayer({ marker, score, preview }); setStatus('')
    } catch (error) {
      const message = abort.signal.aborted ? 'Recognition cancelled.' : error instanceof Error ? error.message : 'Recognition failed.'
      if (completed.length) {
        const score = combineDocumentScores(completed)
        score.warnings.push(message + ' Only completed pages are included.')
        marker.endPage = score.sourcePages?.at(-1)?.page ?? marker.page
        setPlayer({ marker, score, preview })
        setStatus(message + ' Completed pages are available for review.')
      } else { if (!abort.signal.aborted) setError(message); setStatus(abort.signal.aborted ? message : '') }
    }
    finally { ocr?.dispose(); setBusy(false); controller.current = undefined }
  }

  if (!reader || !state) return <div className="p-3 text-sm">{error ? <div role="alert" className="text-destructive">{error}</div> : <div role="status">Opening document...</div>}</div>
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2"><h1 className="truncate text-sm font-semibold" title={entry.path}>{entry.name}</h1><MarkerHelp label="Documents are read from your configured root. Markers and reviewed scores are saved separately in .guitar-documents. PDF, scanned JPG/PNG/GIF/WebP pages, TXT, MD, TAB, DOCX text, and MusicXML are supported." /></div>
    <div className="flex flex-wrap items-center gap-1 border-b p-2">
      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1 || busy} onClick={() => goTo(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
      <Input aria-label={(reader.pdf || reader.image) ? 'Page' : 'Section'} type="number" className="h-8 w-16" value={page} min={1} max={reader.pages} disabled={busy} onChange={event => goTo(Number(event.target.value))} />
      <span className="text-xs tabular-nums">/ {reader.pages}</span>
      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= reader.pages || busy} onClick={() => goTo(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      <select aria-label="Zoom" value={zoom} className="h-8 rounded-md border bg-background px-1 text-xs" onChange={event => setZoom(Number(event.target.value))}>{[75, 100, 125, 150, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select>
      {(reader.pdf || reader.image) && <><Button size="sm" variant={selecting ? 'secondary' : 'ghost'} disabled={busy} aria-pressed={selecting} onClick={() => setSelecting(!selecting)}><Crop className="mr-1 h-3 w-3" />Select region</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (!region) setRegion({ x: 0, y: 0, width: 1, height: 1 }); setCoordinates(true) }}>Coordinates</Button></>}
      <Button size="sm" variant="ghost" disabled={!region || busy} onClick={() => setRegion(undefined)}>Clear crop</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(newMarker())}><BookmarkPlus className="mr-1 h-3 w-3" />Marker</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setGeneration(true)}><Wand2 className="mr-1 h-3 w-3" />Generate</Button>
    </div>
    <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1">
      {focusedMarker && <>
        {(focusedMarker.score || focusedMarker.kind === 'notation' || focusedMarker.kind === 'tab') && <Button size="sm" variant="outline" disabled={busy} onClick={() => void recognize(focusedMarker.kind === 'tab' ? 'tab' : 'notation', focusedMarker)}><Play className="mr-1 h-3 w-3" />{focusedMarker.score ? 'Open marker score' : 'Read marker'}</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(focusedMarker)}>Edit marker</Button>
      </>}
      {(reader.pdf || reader.image) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNotationDialog(true)}><ScanLine className="mr-1 h-3 w-3" />Read notation</Button>}
      
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void recognize('notation', undefined, true)}><Music className="mr-1 h-3 w-3" />{reader.score ? 'Open score' : 'Score editor'}</Button>
      <MarkerHelp label="Include a whole staff system, clef, key and time signature. Reading a note alone cannot determine its pitch or rhythm. TAB recognition drafts string/fret positions; its timing must be entered. Score editor also imports corrected MusicXML." />
      {omrAvailable === false && <span className="text-xs text-muted-foreground">Audiveris setup required<MarkerHelp label="Run npm run documents:omr in the project folder on Windows, or set AUDIVERIS_PATH to an installed executable, then reopen the book." /></span>}
      {busy && <Button size="sm" variant="outline" className="ml-auto" onClick={() => controller.current?.abort()}>Cancel</Button>}
    </div>
    {(error || saveError) && <div role="alert" className="flex items-center gap-2 border-b px-3 py-2 text-xs text-destructive"><span>{error || saveError}</span>{saveError && <Button size="sm" variant="outline" onClick={() => persist(state)}>Retry save</Button>}<Button size="sm" variant="ghost" onClick={() => setError('')}>Dismiss</Button></div>}
    {status && <div role="status" className="border-b px-3 py-1 text-xs text-muted-foreground">{status}</div>}
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" onMouseUp={() => { const selection = window.getSelection()?.toString(); if (selection) selectedText.current = selection }}>
        <DocumentPageView reader={reader} page={page} zoom={zoom} selecting={selecting && !busy} region={region} onRegion={setRegion} onCanvas={onCanvas} onError={setError} />
      </div>
      {markersPanel ?? (!hideMarkers && <section aria-label="Document markers" className="flex max-h-52 shrink-0 flex-col border-t xl:max-h-none xl:w-80 xl:border-l xl:border-t-0">
        <div className="flex items-center gap-2 border-b px-2 py-2 text-xs font-medium">Markers<span className="tabular-nums text-muted-foreground">{state.markers.length}</span><MarkerHelp label="Select a title to navigate. Edit opens type, learning category, notes, tags, and progress. Play opens a saved score; Recognize reads a detected music region." /></div>
        <div className="min-h-0 overflow-auto custom-scrollbar">
          {state.markers.length === 0 ? <div className="p-3 text-xs text-muted-foreground">No markers yet.</div> : <table className="w-full table-fixed whitespace-nowrap text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left font-medium">Title</th><th className="w-10 px-1 py-1 text-right font-medium">Page</th><th className="w-10 px-1 py-1 text-left font-medium">Type</th><th className="w-24"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{state.markers.map(marker => <tr key={marker.id} className={`border-t ${marker.page === page ? 'bg-muted/40' : ''}`}>
              <td className="px-2 py-1"><button className="block w-full truncate rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={busy} title={marker.title} onClick={() => goTo(marker.page, marker.region)}>{marker.title}</button></td>
              <td className="px-1 py-1 text-right tabular-nums">{marker.page}</td><td className="px-1 py-1"><span title={marker.kind}>{marker.kind === 'notation' ? 'Staff' : marker.kind === 'section' ? 'Sec.' : marker.kind === 'tab' ? 'TAB' : 'Note'}</span></td>
              <td className="px-1 py-1"><div className="flex justify-end">
                {(marker.score || marker.kind === 'notation' || marker.kind === 'tab') && <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} title={marker.score ? 'Open player' : 'Recognize music'} aria-label={`${marker.score ? 'Play' : 'Recognize'} ${marker.title}`} onClick={() => void recognize(marker.kind === 'tab' ? 'tab' : 'notation', marker)}>{marker.score ? <Play className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Edit ${marker.title}`} onClick={() => setEditing(marker)}><Edit2 className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Delete ${marker.title}`} onClick={() => setDeleting(marker)}><Trash2 className="h-3 w-3" /></Button>
              </div></td>
            </tr>)}</tbody></table>}
        </div>
      </section>)}
    </div>
    {editing && <DocumentMarkerEditor marker={editing} pages={reader.pages} onClose={() => setEditing(undefined)} onSave={marker => { upsert(marker); setEditing(undefined) }} />}
    {notationDialog && <DocumentNotationDialog page={page} pages={reader.pages} selection={Boolean(region)} preview={region && rendered.current ? cropDocumentCanvas(rendered.current, region).toDataURL('image/png') : undefined} onClose={() => setNotationDialog(false)} onRead={options => void recognize('notation', undefined, false, options)} />}
    {generation && <DocumentGenerationDialog pages={reader.pages} pdf={Boolean((reader.pdf || reader.image))} onClose={() => setGeneration(false)} onGenerate={options => void generate(options)} />}
    {candidates && !player && <DocumentMarkerReview candidates={candidates} onClose={() => setCandidates(undefined)} onSave={markers => { persist({ ...state, markers: mergeDocumentMarkers(state.markers, markers) }); setCandidates(undefined); setStatus(`${markers.length} markers added.`) }} />}
    {player && <DocumentScorePlayer unsaved={!player.marker.score} initial={player.score} title={player.marker.title} preview={player.preview} reader={player.score.sourceImage ? undefined : reader} onReadAgain={(reader.pdf || reader.image) && !player.score.sourceImage && player.marker.kind === 'notation' ? () => { const marker = { ...player.marker, score: undefined }; setPlayer(undefined); void recognize('notation', marker, false, { engine: player.score.source === 'gpt-vision' ? 'gpt' : 'audiveris', scope: marker.region ? 'selection' : 'range', from: marker.page, to: marker.endPage, beats: player.score.beats ?? 4, beatType: player.score.beatType ?? 4 }) } : undefined} onClose={() => setPlayer(undefined)} onSave={async score => { await upsert({ ...player.marker, score }); setPlayer(undefined) }} />}
    {deleting && <DocumentDialog title="Delete marker?" onClose={() => setDeleting(undefined)}><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setDeleting(undefined)}>Cancel</Button><Button size="sm" variant="destructive" onClick={() => { persist({ ...state, markers: state.markers.filter(marker => marker.id !== deleting.id) }); setDeleting(undefined) }}>Delete marker</Button></div></DocumentDialog>}
    {coordinates && region && <DocumentDialog title="Region coordinates (%)" onClose={() => setCoordinates(false)}><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => <label className="text-xs" key={key}>{key}<Input type="number" min={0} max={100} step={0.1} value={Math.round(region[key] * 1000) / 10} onChange={event => { const next = { ...region, [key]: Math.max(0, Math.min(1, Number(event.target.value) / 100)) }; next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y); setRegion(next) }} /></label>)}</div><div className="mt-3 flex justify-end"><Button size="sm" disabled={region.width <= 0 || region.height <= 0} onClick={() => { setSelecting(true); setCoordinates(false) }}>Use region</Button></div></DocumentDialog>}
  </div>
}
