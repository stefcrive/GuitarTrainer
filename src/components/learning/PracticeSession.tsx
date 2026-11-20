'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, Info, Pause, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { PracticeMedia } from '@/components/learning/PracticeMedia'
import { loadMarkerPracticeHistory, recordPracticeProgress } from '@/services/learning'
import { updateCatalogMarkerProgress, type MarkerCatalogItem } from '@/services/marker-catalog'
import { getLearningDomainLabel, type LearningMarkerState } from '@/types/learning'

export function PracticeSession({ item, sessionId, plannedMinutes, state, storageHandle, nextItem, onClose, onNext, onSaved }: {
  item: MarkerCatalogItem; sessionId?: string; plannedMinutes?: number; state?: LearningMarkerState
  storageHandle: FileSystemDirectoryHandle; nextItem?: MarkerCatalogItem
  onClose: () => void; onNext: () => void; onSaved: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [progress, setProgress] = useState(item.marker.completionDegree ?? 0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const elapsedRef = useRef(0)
  const startedAt = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const savedEvent = useRef(false)
  const eventId = useRef(crypto.randomUUID())
  const savingRef = useRef(false)
  const [locked, setLocked] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadMarkerPracticeHistory>>>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const learning = item.marker.learning

  useEffect(() => {
    let cancelled = false
    loadMarkerPracticeHistory(storageHandle, item.markerKey)
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch(() => { if (!cancelled) setHistoryError('Practice history could not be loaded.') })
    return () => { cancelled = true }
  }, [storageHandle, item.markerKey])

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => {
      setElapsedMs(elapsedRef.current + (startedAt.current === null ? 0 : Date.now() - startedAt.current))
    }, 250)
    return () => window.clearInterval(interval)
  }, [running])

  const pauseTimer = () => {
    if (startedAt.current !== null) elapsedRef.current += Math.max(0, Date.now() - startedAt.current)
    startedAt.current = null
    setElapsedMs(elapsedRef.current)
    setRunning(false)
    return elapsedRef.current
  }
  const requestClose = () => {
    if (savingRef.current) return
    if (!savedEvent.current && (elapsedMs > 0 || running || notes.trim() || progress !== (item.marker.completionDegree ?? 0))) {
      pauseTimer()
      setConfirmDiscard(true)
    } else onClose()
  }
  const save = async (advance: boolean) => {
    if (savingRef.current) return
    const duration = pauseTimer()
    savingRef.current = true
    setSaving(true)
    setLocked(true)
    setError(null)
    try {
      // Keep a successful event across retries if updating the source marker fails.
      if (!savedEvent.current) {
        await recordPracticeProgress(storageHandle, item, {
          eventId: eventId.current, sessionId, durationMs: duration, progressBefore: item.marker.completionDegree ?? 0, progressAfter: progress, notes: notes.trim() || undefined
        })
        savedEvent.current = true
        setLocked(true)
      }
      await updateCatalogMarkerProgress(item, progress)
      await onSaved()
      if (advance && nextItem) onNext()
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save practice. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const prompt = learning?.domain === 'musical-device'
    ? learning.extractionPrompt || learning.practicePrompt
    : learning?.practicePrompt || learning?.practiceUseCase
  return (
    <dialog ref={dialog} aria-labelledby="practice-title" onCancel={(event) => { event.preventDefault(); requestClose() }}
      className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-4xl overflow-y-auto rounded-md border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 id="practice-title" className="min-w-0 flex-1 truncate text-sm font-semibold" title={item.markerTitle}>{item.markerTitle}</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">{getLearningDomainLabel(learning?.domain)}</span>
        <Button size="sm" variant="ghost" aria-label="Close practice" onClick={requestClose} disabled={saving}><X className="h-4 w-4" /></Button>
      </header>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="min-w-0 flex-1 truncate" title={item.sourceTitle}>{item.sourceTitle}</span><span className="shrink-0 tabular-nums">{formatMarkerRange(item)}</span></div>
          <PracticeMedia item={item} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-xs">
            <span className="flex items-center gap-1 font-medium">Practice task <PracticeHelp label="Practice task" text={prompt || 'Play the marked section slowly and accurately, then increase speed when it feels secure.'} /></span>
            <span className="flex items-center gap-1">Output <PracticeHelp label="Suggested output" text={learning?.suggestedOutput || 'Play a clean take of this marker, then log what improved and what to work on next.'} /></span>
            <span className="flex items-center gap-1">Constraints <PracticeHelp label="Practice constraints" text={learning?.suggestedConstraints?.join('; ') || 'Choose a comfortable tempo and focus on one thing at a time.'} /></span>
          </div>
          <details className="rounded-md border text-xs">
            <summary className="cursor-pointer px-3 py-2 font-medium">Marker details</summary>
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t p-3 [&_dt]:text-muted-foreground [&_dd]:break-words">
              <dt>Source</dt><dd>{item.sourceTitle}</dd>
              <dt>Category</dt><dd>{getLearningDomainLabel(learning?.domain)}</dd>
              <dt>Primary domain</dt><dd>{learning?.primaryDomain || '-'}</dd>
              <dt>Weekly role</dt><dd>{learning?.weeklyPracticeRole || '-'}</dd>
              <dt>Tags</dt><dd>{item.tags.join(', ') || '-'}</dd>
              <dt>Notes</dt><dd className="whitespace-pre-wrap">{item.annotation?.text || '-'}</dd>
              {learning?.musicalFunction && <><dt>Function</dt><dd>{learning.musicalFunction}</dd></>}
              {learning?.practiceUseCase && <><dt>Use case</dt><dd>{learning.practiceUseCase}</dd></>}
              {learning?.practicePrompt && <><dt>Practice</dt><dd>{learning.practicePrompt}</dd></>}
              {learning?.extractionPrompt && <><dt>Extraction</dt><dd>{learning.extractionPrompt}</dd></>}
              {learning?.difficultyLevel && <><dt>Difficulty</dt><dd>{learning.difficultyLevel}</dd></>}
              {!!learning?.requiredPrerequisites?.length && <><dt>Prerequisites</dt><dd>{learning.requiredPrerequisites.join(', ')}</dd></>}
            </dl>
          </details>
          <details className="rounded-md border text-xs">
            <summary className="cursor-pointer px-3 py-2 font-medium">Recent practice ({history.length})</summary>
            {historyError ? <div role="alert" className="px-3 pb-2 text-destructive">{historyError}</div> : history.length ? <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[380px] table-fixed text-left">
                <thead className="text-muted-foreground"><tr><th className="w-24 px-3 py-2">Date</th><th className="w-16 px-2 py-2 text-right">Min</th><th className="w-20 px-2 py-2 text-right">Dominance</th><th className="px-3 py-2">Note</th></tr></thead>
                <tbody className="divide-y">{history.map((entry) => <tr key={entry.id} className="h-8"><td className="whitespace-nowrap px-3">{new Date(entry.occurred_at).toLocaleDateString()}</td><td className="px-2 text-right tabular-nums">{Math.round(entry.duration_ms / 60000)}</td><td className="px-2 text-right tabular-nums">{entry.progress_after}%</td><td className="px-3"><div className="flex items-center"><span className="truncate">{entry.notes || '-'}</span>{entry.notes && <PracticeHelp label="Session note" text={entry.notes} />}</div></td></tr>)}</tbody>
              </table>
            </div> : <div className="px-3 pb-2 text-muted-foreground">No saved practice yet.</div>}
          </details>
        </div>
        <div className="space-y-3">
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1 font-medium">Practice time <PracticeHelp label="Practice timer" text="Counts time while running, including when you switch tabs or play without the recording. Media playback and the timer are independent." /></span>{plannedMinutes && <span className="text-muted-foreground">{plannedMinutes} min planned</span>}</div>
            <output className="my-2 block text-3xl font-semibold tabular-nums" aria-label="Elapsed practice time">{formatElapsed(elapsedMs)}</output>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || locked} className="gap-2" onClick={() => {
                if (running) pauseTimer()
                else { startedAt.current = Date.now(); setRunning(true) }
              }}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{running ? 'Pause timer' : 'Start timer'}</Button>
              <Button size="sm" variant="ghost" disabled={saving || locked || running} onClick={() => { elapsedRef.current = 0; setElapsedMs(0) }}>Reset</Button>
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1 font-medium"><span id="dominance-label">Dominance</span><PracticeHelp label="About dominance" text="How reliably can you play or use this material? 0% is new; 100% is consistently secure. Saving updates your next review date." /></span><span className="tabular-nums">{progress}%</span></div>
            <Slider aria-labelledby="dominance-label" value={[progress]} min={0} max={100} step={1} disabled={saving || locked} onValueChange={([value]) => setProgress(value)} />
            <label htmlFor="practice-notes" className="block text-xs font-medium">Session note</label>
            <Input id="practice-notes" placeholder="Tempo, improvement, next step" value={notes} disabled={saving || locked} onChange={(event) => setNotes(event.target.value)} className="h-8 text-xs" />
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-1 px-1 text-xs [&_dt]:text-muted-foreground [&_dd]:text-right [&_dd]:tabular-nums">
            <dt>Last practiced</dt><dd>{state?.lastPracticedAt ? new Date(state.lastPracticedAt).toLocaleDateString() : 'Never'}</dd>
            <dt>Next review</dt><dd>{state?.dueAt ? new Date(state.dueAt).toLocaleDateString() : 'New'}</dd>
            <dt>Total practice</dt><dd>{Math.round((state?.totalPracticeMs ?? 0) / 60000)} min</dd>
          </dl>
          {error && <div role="alert" className="text-xs text-destructive">{error}{savedEvent.current ? ' Your session is logged; retry to finish updating the marker.' : ' Retry to save this session.'}</div>}
          <div className="flex flex-col gap-2">
            <Button className="gap-2" disabled={saving || (!locked && elapsedMs === 0 && progress === (item.marker.completionDegree ?? 0) && !notes.trim())} onClick={() => void save(Boolean(nextItem))}>
              <CheckCircle2 className="h-4 w-4" />{saving ? 'Saving...' : locked ? 'Retry save' : nextItem ? 'Save & next' : 'Save practice'}
            </Button>
            {nextItem && <Button size="sm" variant="outline" disabled={saving || (!locked && elapsedMs === 0 && progress === (item.marker.completionDegree ?? 0) && !notes.trim())} onClick={() => void save(false)}>Save & finish</Button>}
          </div>
        </div>
      </div>
      {confirmDiscard && <div role="alert" className="flex flex-wrap items-center justify-end gap-2 border-t p-3 text-xs">
        <span className="mr-auto">Discard this unsaved practice?</span><Button size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep practicing</Button><Button size="sm" variant="destructive" onClick={onClose}>Discard</Button>
      </div>}
    </dialog>
  )
}

export function PracticeHelp({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const dismiss = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [open])
  return <span ref={ref} className="relative inline-flex shrink-0" onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) } }}>
    <button type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 264)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 248)) })
      setOpen(!open)
    }} className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2"><Info className="h-3.5 w-3.5" /></button>
    {open && <span id={id} role="tooltip" style={position} className="fixed z-50 max-h-60 w-64 max-w-[80vw] overflow-auto whitespace-normal rounded-md border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg">{text}</span>}
  </span>
}

export function formatMarkerRange(item: MarkerCatalogItem) {
  if (item.documentMarker) return item.documentMarker.endPage > item.documentMarker.page ? `Pages ${item.documentMarker.page}-${item.documentMarker.endPage}` : `Page ${item.documentMarker.page}`
  const start = Math.max(0, item.marker.startTime || 0)
  return item.marker.endTime > start ? `${formatElapsed(start * 1000)}-${formatElapsed(item.marker.endTime * 1000)}` : `${formatElapsed(start * 1000)}-end`
}
function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
