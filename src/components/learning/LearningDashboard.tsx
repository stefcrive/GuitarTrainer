'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CheckCircle2, Play, RefreshCw, Search, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MetricBadge } from '@/components/ui/metric-badge'
import { LearningDomainSelect } from '@/components/learning/LearningDomainSelect'
import { PracticeSession, PracticeHelp, formatMarkerRange } from '@/components/learning/PracticeSession'
import { useDirectoryStore } from '@/stores/directory-store'
import { generateAndSaveWeeklyRoutine, loadLatestLearningRoutine, loadLearningStateMap, loadLearningStats } from '@/services/learning'
import { loadMarkerCatalog, updateCatalogMarkerLearning, type MarkerCatalogItem } from '@/services/marker-catalog'
import { LEARNING_DOMAIN_OPTIONS, getLearningDomainLabel, type LearningDomain, type LearningMarkerState, type LearningRoutine, type LearningStats } from '@/types/learning'
import { cn } from '@/lib/utils'

type LibraryFilter = LearningDomain | 'unassigned'
const DOMAIN_HELP: Record<LibraryFilter, string> = {
  repertoire: 'Material to perform: tunes, sections, arrangements, and playing with others. Build a complete musical result.',
  'musical-device': 'Reusable musical ideas: harmony, voice leading, improvisation, and composition. Extract an idea, vary it, then apply it to repertoire.',
  training: 'Supporting skills: technique, ear training, rhythm, fretboard navigation, theory, and practice methods. Work on a specific limitation, then return to the music.',
  unassigned: 'Choose a category to include a marker in routine generation. Automatic markers use the same three categories; you can correct them here.'
}

export function LearningDashboard() {
  const { rootHandle, audioRootHandle, scanVideoFolderForAudio } = useDirectoryStore()
  const storageHandle = rootHandle ?? audioRootHandle
  const [catalog, setCatalog] = useState<MarkerCatalogItem[]>([])
  const [stateMap, setStateMap] = useState<Map<string, LearningMarkerState>>(new Map())
  const [routine, setRoutine] = useState<LearningRoutine | null>(null)
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [targetMinutes, setTargetMinutes] = useState(45)
  const [selectedItem, setSelectedItem] = useState<MarkerCatalogItem | null>(null)
  const [sessionQueue, setSessionQueue] = useState<string[]>([])
  const [filter, setFilter] = useState<LibraryFilter>('repertoire')
  const [query, setQuery] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    if (!storageHandle) {
      setCatalog([])
      setStateMap(new Map())
      setRoutine(null)
      setStats(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextStateMap, nextRoutine, nextStats] = await Promise.all([
        loadMarkerCatalog({ rootHandle, audioRootHandle, includeAudioFromVideoRoot: scanVideoFolderForAudio }),
        loadLearningStateMap(storageHandle), loadLatestLearningRoutine(storageHandle), loadLearningStats(storageHandle)
      ])
      if (request !== requestRef.current) return
      setCatalog(nextCatalog)
      setStateMap(nextStateMap)
      setRoutine(nextRoutine)
      setStats(nextStats)
      if (nextRoutine) setTargetMinutes(nextRoutine.targetMinutes)
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Unable to load practice data.')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [audioRootHandle, rootHandle, scanVideoFolderForAudio, storageHandle])

  useEffect(() => {
    setSelectedItem(null)
    void refresh()
    const requests = requestRef
    return () => { requests.current++ }
  }, [refresh])

  const catalogByKey = useMemo(() => new Map(catalog.map((item) => [item.markerKey, item])), [catalog])
  const counts = useMemo(() => {
    const result = { repertoire: 0, 'musical-device': 0, training: 0, unassigned: 0 }
    catalog.forEach((item) => { result[item.marker.learning?.domain ?? 'unassigned']++ })
    return result
  }, [catalog])
  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase()
    return catalog.filter((item) =>
      (item.marker.learning?.domain ?? 'unassigned') === filter &&
      (!dueOnly || !stateMap.get(item.markerKey)?.dueAt || stateMap.get(item.markerKey)!.dueAt! <= Date.now()) &&
      (!search || [item.markerTitle, item.sourceTitle, item.annotation?.text, ...item.tags,
        ...(item.marker.learning?.topics ?? []), item.marker.learning?.weeklyPracticeRole,
        item.marker.learning?.primaryDomain].join(' ').toLowerCase().includes(search))
    ).sort((a, b) => (stateMap.get(a.markerKey)?.dueAt ?? 0) - (stateMap.get(b.markerKey)?.dueAt ?? 0))
  }, [catalog, filter, query, dueOnly, stateMap])

  const openMarker = (item: MarkerCatalogItem, queue: string[] = []) => {
    setSessionQueue(queue)
    setSelectedItem(item)
    setNotice(null)
  }
  const handleGenerate = async () => {
    if (!storageHandle) return
    setGenerating(true)
    setError(null)
    try {
      const next = await generateAndSaveWeeklyRoutine(storageHandle, catalog, targetMinutes)
      setRoutine(next)
      setTargetMinutes(next.targetMinutes)
      setNotice('Routine ready. Open a marker to begin practicing.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate a routine.')
    } finally { setGenerating(false) }
  }
  const handleDomainChange = async (item: MarkerCatalogItem, domain: LearningDomain | undefined) => {
    setUpdatingKey(item.markerKey)
    setError(null)
    try {
      await updateCatalogMarkerLearning(item, { domain })
      setCatalog((current) => current.map((entry) => entry.markerKey === item.markerKey
        ? { ...entry, marker: { ...entry.marker, learning: { ...entry.marker.learning, domain } } } : entry))
      setNotice('Category saved. Generate a new routine to use the updated categories.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the category.')
    } finally { setUpdatingKey(null) }
  }

  if (!storageHandle) return (
    <div className="flex flex-wrap items-center justify-center gap-3 p-6">
      <Target className="h-5 w-5 text-muted-foreground" />
      <h1 className="text-sm font-medium">Select a library folder to start practicing</h1>
      <Button asChild size="sm"><Link href="/settings">Open Settings</Link></Button>
    </div>
  )

  const today = stats?.dayStats.find((day) => day.date === localDate())
  const nextKey = sessionQueue[sessionQueue.indexOf(selectedItem?.markerKey ?? '') + 1]
  const nextItem = nextKey ? catalogByKey.get(nextKey) : undefined
  return (
    <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-5 w-5" />Practice Desk</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="target-minutes" className="text-xs text-muted-foreground">Daily minutes</label>
          <Input id="target-minutes" type="number" min={15} max={180} step={1} value={targetMinutes}
            onChange={(event) => setTargetMinutes(Number(event.target.value))} className="h-8 w-16" />
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || generating} aria-label="Refresh practice desk">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={loading || generating || catalog.length === counts.unassigned || targetMinutes < 15 || targetMinutes > 180}>
            <CalendarDays className="mr-2 h-4 w-4" />{generating ? 'Generating...' : routine ? 'Regenerate routine' : 'Generate routine'}
          </Button>
          <PracticeHelp label="Routine generation" text="Builds a repeatable daily routine from your categories, due dates, and dominance. Each available category gets a place before supporting items are added. Regenerating replaces the displayed plan; practice history is kept." />
        </div>
      </header>
      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">{notice}<button onClick={() => setNotice(null)} className="underline">Dismiss</button></div>}
      <div className="flex flex-wrap items-center gap-2" aria-label="Practice statistics">
        <MetricBadge value={`${Math.round((today?.totalPracticeMs ?? 0) / 60000)} / ${targetMinutes}m`} label="today" />
        <MetricBadge value={stats?.practiceDays ?? 0} label="practice days" />
        <MetricBadge value={`${Math.round((stats?.totalPracticeMs ?? 0) / 60000)}m`} label="total" />
        <MetricBadge value={stats?.practicedMarkerCount ?? 0} label="markers practiced" />
        <MetricBadge value={`${(stats?.averageProgressDelta ?? 0).toFixed(1)} pp`} label="avg. progress" />
        <PracticeHelp label="Practice history" text={stats?.dayStats.length ? stats.dayStats.slice(-14).map((day) => `${day.date}: ${Math.round(day.totalPracticeMs / 60000)}m, ${day.markerCount} markers`).join('; ') : 'No practice logged yet. Save a practice session to update these totals.'} />
      </div>
      <RoutinePanel routine={routine} catalogByKey={catalogByKey} stateMap={stateMap} loading={loading} onOpenMarker={openMarker} />
      <section className="min-w-0 rounded-md border bg-background" aria-label="Practice library">
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <div className="flex max-w-full flex-wrap gap-1" role="group" aria-label="Marker category">
            {[...LEARNING_DOMAIN_OPTIONS, { value: 'unassigned' as const, label: 'Unassigned' }].map((option) => (
              <Button key={option.value} size="sm" variant={filter === option.value ? 'secondary' : 'ghost'} aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)} className="gap-2 text-xs">
                {option.label}<span className="text-muted-foreground tabular-nums">{counts[option.value]}</span>
              </Button>
            ))}
          </div>
          <PracticeHelp label={filter === 'unassigned' ? 'Unassigned markers' : getLearningDomainLabel(filter)} text={DOMAIN_HELP[filter]} />
          <div className="relative ml-auto min-w-40 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search markers, sources, and tags" placeholder="Search markers, sources, tags" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 text-xs" />
          </div>
          <label className="flex h-8 items-center gap-2 px-1 text-xs"><input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} />Due / new</label>
          <span className="text-xs text-muted-foreground tabular-nums">{visibleItems.length} shown</span>
        </div>
        {loading ? <div role="status" className="p-4 text-sm text-muted-foreground">Loading markers...</div> : (
          <MarkerTable items={visibleItems} stateMap={stateMap} updatingKey={updatingKey} onDomainChange={handleDomainChange} onOpenMarker={openMarker}
            emptyText={query || dueOnly ? 'No markers match these filters.' : counts[filter] === 0 ? 'No markers in this category. Assign categories here or generate markers in your media library.' : 'No markers available.'} />
        )}
      </section>
      {selectedItem && <PracticeSession key={selectedItem.markerKey} item={selectedItem}
        sessionId={routine?.items.some((entry) => entry.markerKey === selectedItem.markerKey) ? routine.id : undefined}
        plannedMinutes={routine?.items.find((entry) => entry.markerKey === selectedItem.markerKey)?.plannedMinutes}
        state={stateMap.get(selectedItem.markerKey)} storageHandle={storageHandle} nextItem={nextItem}
        onClose={() => setSelectedItem(null)} onNext={() => { if (nextItem) setSelectedItem(nextItem) }}
        onSaved={async () => { await refresh(); setNotice('Practice saved.') }} />}
    </div>
  )
}

function RoutinePanel({ routine, catalogByKey, stateMap, loading, onOpenMarker }: {
  routine: LearningRoutine | null; catalogByKey: Map<string, MarkerCatalogItem>; stateMap: Map<string, LearningMarkerState>; loading: boolean
  onOpenMarker: (item: MarkerCatalogItem, queue?: string[]) => void
}) {
  const available = routine?.items.filter((item) => catalogByKey.has(item.markerKey)) ?? []
  const practicedToday = (key: string) => {
    const last = stateMap.get(key)?.lastPracticedAt
    return Boolean(last && localDate(last) === localDate())
  }
  const pending = available.filter((item) => !practicedToday(item.markerKey))
  const next = pending[0]
  const dayIndex = (new Date().getDay() + 6) % 7
  return (
    <section className="min-w-0 rounded-md border bg-background" aria-label="Today's routine">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Today&apos;s routine</h2>
        {routine && <>
          <PracticeHelp label="Weekly objective" text={`${routine.objective} Started ${routine.routineDate}. Today's focus: ${routine.dailySchedule[dayIndex]?.focus ?? 'Practice the selected material'}.`} />
          <span className="text-xs text-muted-foreground">{available.length - pending.length}/{available.length} practiced today</span>
          <span className="text-xs text-muted-foreground tabular-nums">{routine.targetMinutes} min</span>
          <Button size="sm" className="ml-auto gap-2" disabled={!next || loading} onClick={() => next && onOpenMarker(catalogByKey.get(next.markerKey)!, pending.map((item) => item.markerKey))}>
            <Play className="h-3.5 w-3.5" />{next ? pending.length === available.length ? 'Start routine' : 'Continue routine' : 'Today complete'}
          </Button>
        </>}
      </div>
      {!routine ? <div className="px-3 py-4 text-sm text-muted-foreground">{loading ? 'Loading routine...' : 'Generate a routine, or practice any marker below.'}</div> : <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left text-xs">
            <thead className="border-b bg-muted/35 text-muted-foreground"><tr>
              <th className="w-10 px-3 py-2"><span className="sr-only">Status</span></th><th className="px-2 py-2">Marker</th>
              <th className="w-36 px-2 py-2">Category</th><th className="w-40 px-2 py-2">Source</th>
              <th className="w-16 px-2 py-2 text-right">Min</th><th className="w-24 px-3 py-2"><span className="sr-only">Practice</span></th>
            </tr></thead>
            <tbody className="divide-y">{routine.items.map((entry) => {
              const item = catalogByKey.get(entry.markerKey)
              const done = practicedToday(entry.markerKey)
              return <tr key={entry.id} className="h-10 hover:bg-muted/35">
                <td className="px-3">{done ? <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Practiced today" /> : <span className="text-muted-foreground">{entry.sortOrder + 1}</span>}</td>
                <td className="px-2"><div className="flex min-w-0 items-center gap-1"><button className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" disabled={!item || loading} onClick={() => item && onOpenMarker(item, available.map((row) => row.markerKey))}>{item?.markerTitle ?? 'Marker unavailable'}</button><PracticeHelp label="Selection reason" text={`${entry.role}. ${entry.rationale}`} /></div></td>
                <td className="truncate px-2">{getLearningDomainLabel(item ? item.marker.learning?.domain : entry.domain)}</td>
                <td className="truncate px-2 text-muted-foreground" title={item?.sourceTitle}>{item?.sourceTitle ?? 'Reconnect its library'}</td>
                <td className="px-2 text-right tabular-nums">{entry.plannedMinutes}</td>
                <td className="px-3"><Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!item || loading} onClick={() => item && onOpenMarker(item, available.map((row) => row.markerKey))}>{done ? 'Practice again' : 'Practice'}</Button></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
          <span className="flex items-center gap-1 font-medium">Weekly output <PracticeHelp label="Weekly output" text={`${routine.deliverable} ${routine.recordingAssignment}`} /></span>
          <span className="flex items-center gap-1">{routine.dailySchedule[dayIndex]?.label ?? 'Today'}: {routine.dailySchedule[dayIndex]?.focus ?? 'Practice'} <PracticeHelp label="Weekly schedule" text={routine.dailySchedule.map((day) => `${day.label}: ${day.focus}`).join('; ')} /></span>
          <span className="flex items-center gap-1">Review <PracticeHelp label="Weekly review" text={routine.reviewQuestion} /></span>
        </div>
      </>}
    </section>
  )
}

function MarkerTable({ items, stateMap, updatingKey, emptyText, onDomainChange, onOpenMarker }: {
  items: MarkerCatalogItem[]; stateMap: Map<string, LearningMarkerState>; updatingKey: string | null; emptyText: string
  onDomainChange: (item: MarkerCatalogItem, domain: LearningDomain | undefined) => Promise<void>
  onOpenMarker: (item: MarkerCatalogItem) => void
}) {
  if (!items.length) return <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>
  return <div className="max-h-[60vh] overflow-auto custom-scrollbar">
    <table className="w-full min-w-[960px] table-fixed text-left text-xs">
      <thead className="sticky top-0 z-10 border-b bg-background text-muted-foreground"><tr>
        <th className="px-3 py-2">Marker</th><th className="w-[19%] px-3 py-2">Source</th><th className="w-[13%] px-3 py-2">Tags</th>
        <th className="w-28 px-3 py-2">Range</th><th className="w-24 px-3 py-2 text-right">Dominance</th><th className="w-20 px-3 py-2">Due</th>
        <th className="w-40 px-3 py-2">Category</th><th className="w-24 px-3 py-2"><span className="sr-only">Practice</span></th>
      </tr></thead>
      <tbody className="divide-y">{items.map((item) => <tr key={item.markerKey} className="h-10 hover:bg-muted/35">
        <td className="px-3 py-1"><button onClick={() => onOpenMarker(item)} className="block w-full truncate text-left font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" title={item.markerTitle}>{item.markerTitle}</button></td>
        <td className="truncate px-3 py-1 text-muted-foreground" title={item.sourceTitle}>{item.sourceTitle}</td>
        <td className="truncate px-3 py-1 text-muted-foreground" title={item.tags.join(', ')}>{item.tags.join(', ') || '-'}</td>
        <td className="whitespace-nowrap px-3 py-1 tabular-nums">{formatMarkerRange(item)}</td>
        <td className="px-3 py-1 text-right tabular-nums">{item.marker.completionDegree ?? 0}%</td>
        <td className="whitespace-nowrap px-3 py-1">{formatDue(stateMap.get(item.markerKey)?.dueAt)}</td>
        <td className="px-3 py-1"><fieldset disabled={updatingKey !== null} aria-label={`Category for ${item.markerTitle}`}><LearningDomainSelect value={item.marker.learning?.domain} className="h-8 w-full text-xs" onChange={(domain) => void onDomainChange(item, domain)} /></fieldset></td>
        <td className="px-2 py-1"><Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => onOpenMarker(item)}><Play className="h-3 w-3" />Practice</Button></td>
      </tr>)}</tbody>
    </table>
  </div>
}

function localDate(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function formatDue(timestamp?: number) {
  if (!timestamp) return 'New'
  if (timestamp <= Date.now()) return 'Due'
  return `${Math.ceil((timestamp - Date.now()) / 86400000)}d`
}
