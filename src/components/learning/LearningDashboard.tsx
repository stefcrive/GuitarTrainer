'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RefreshCw,
  Target
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { EmptyState } from '@/components/ui/empty-state'
import { LearningDomainSelect } from '@/components/learning/LearningDomainSelect'
import { useDirectoryStore } from '@/stores/directory-store'
import {
  generateAndSaveWeeklyRoutine,
  loadLatestLearningRoutine,
  loadLearningStateMap,
  loadLearningStats,
  recordPracticeProgress
} from '@/services/learning'
import {
  loadMarkerCatalog,
  updateCatalogMarkerLearning,
  updateCatalogMarkerProgress,
  type MarkerCatalogItem
} from '@/services/marker-catalog'
import {
  LEARNING_DOMAIN_OPTIONS,
  getLearningDomainLabel,
  type LearningDomain,
  type LearningMarkerState,
  type LearningRoutine,
  type LearningStats
} from '@/types/learning'
import { cn } from '@/lib/utils'

const DEFAULT_TARGET_MINUTES = 45

export function LearningDashboard() {
  const { rootHandle, audioRootHandle, scanVideoFolderForAudio } = useDirectoryStore()
  const storageHandle = rootHandle ?? audioRootHandle
  const [catalog, setCatalog] = useState<MarkerCatalogItem[]>([])
  const [stateMap, setStateMap] = useState<Map<string, LearningMarkerState>>(new Map())
  const [routine, setRoutine] = useState<LearningRoutine | null>(null)
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [targetMinutes, setTargetMinutes] = useState(DEFAULT_TARGET_MINUTES)
  const [selectedItem, setSelectedItem] = useState<MarkerCatalogItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!storageHandle) return
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextStateMap, nextRoutine, nextStats] = await Promise.all([
        loadMarkerCatalog({
          rootHandle,
          audioRootHandle,
          includeAudioFromVideoRoot: scanVideoFolderForAudio
        }),
        loadLearningStateMap(storageHandle),
        loadLatestLearningRoutine(storageHandle),
        loadLearningStats(storageHandle)
      ])
      setCatalog(nextCatalog)
      setStateMap(nextStateMap)
      setRoutine(nextRoutine)
      setStats(nextStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load learning data.')
    } finally {
      setLoading(false)
    }
  }, [audioRootHandle, rootHandle, scanVideoFolderForAudio, storageHandle])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const assignedCatalog = useMemo(
    () => catalog.filter((item) => item.marker.learning?.domain),
    [catalog]
  )
  const unassignedCatalog = useMemo(
    () => catalog.filter((item) => !item.marker.learning?.domain).slice(0, 12),
    [catalog]
  )
  const catalogByKey = useMemo(
    () => new Map(catalog.map((item) => [item.markerKey, item])),
    [catalog]
  )

  const handleGenerate = async () => {
    if (!storageHandle) return
    setGenerating(true)
    setError(null)
    try {
      const nextRoutine = await generateAndSaveWeeklyRoutine(storageHandle, catalog, targetMinutes)
      setRoutine(nextRoutine)
      const [nextStateMap, nextStats] = await Promise.all([
        loadLearningStateMap(storageHandle),
        loadLearningStats(storageHandle)
      ])
      setStateMap(nextStateMap)
      setStats(nextStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate a routine.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDomainChange = async (item: MarkerCatalogItem, domain: LearningDomain | undefined) => {
    await updateCatalogMarkerLearning(item, { domain })
    setCatalog((current) =>
      current.map((catalogItem) =>
        catalogItem.markerKey === item.markerKey
          ? {
              ...catalogItem,
              marker: {
                ...catalogItem.marker,
                learning: {
                  ...(catalogItem.marker.learning ?? {}),
                  domain
                }
              }
            }
          : catalogItem
      )
    )
  }

  const handleProgressSaved = async () => {
    await refresh()
  }

  if (!storageHandle) {
    return (
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center p-6">
        <EmptyState
          icon={Target}
          title="Select a library folder to build routines"
          description="The learning desk uses the local marker database in your selected video or audio root."
          action={
            <Button asChild>
              <Link href="/settings">Open Settings</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-5 p-4 md:p-6">
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            Weekly learning system
          </div>
          <h1 className="text-2xl font-semibold">Practice Desk</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Build output-oriented practice weeks from marker domains, dominance, due dates, and session history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="target-minutes">
            Daily target
          </label>
          <Input
            id="target-minutes"
            type="number"
            min={15}
            max={180}
            value={targetMinutes}
            onChange={(event) => setTargetMinutes(Number(event.target.value))}
            className="h-9 w-24"
          />
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating || assignedCatalog.length === 0} className="gap-2">
            <CalendarDays className="h-4 w-4" />
            {generating ? 'Generating' : 'Generate Week'}
          </Button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <RoutinePanel
          routine={routine}
          catalogByKey={catalogByKey}
          onOpenMarker={setSelectedItem}
        />
        <StatsPanel stats={stats} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {LEARNING_DOMAIN_OPTIONS.map((domain) => (
          <DomainMarkerTable
            key={domain.value}
            domain={domain.value}
            items={catalog.filter((item) => item.marker.learning?.domain === domain.value)}
            stateMap={stateMap}
            onDomainChange={handleDomainChange}
            onOpenMarker={setSelectedItem}
          />
        ))}
      </section>

      <section className="rounded-md border bg-background">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Unassigned Marker Queue</h2>
            <p className="text-xs text-muted-foreground">
              Assign a domain to let a marker enter weekly routine pooling.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{catalog.length - assignedCatalog.length} waiting</span>
        </div>
        <MarkerQueue
          items={unassignedCatalog}
          onDomainChange={handleDomainChange}
          onOpenMarker={setSelectedItem}
        />
      </section>

      {selectedItem && (
        <PracticeMarkerModal
          item={selectedItem}
          sessionId={routine?.id}
          state={stateMap.get(selectedItem.markerKey)}
          storageHandle={storageHandle}
          onClose={() => setSelectedItem(null)}
          onSaved={handleProgressSaved}
        />
      )}
    </div>
  )
}

function RoutinePanel({
  routine,
  catalogByKey,
  onOpenMarker
}: {
  routine: LearningRoutine | null
  catalogByKey: Map<string, MarkerCatalogItem>
  onOpenMarker: (item: MarkerCatalogItem) => void
}) {
  if (!routine) {
    return (
      <div className="rounded-md border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Today&apos;s Routine</h2>
        </div>
        <EmptyState
          icon={CalendarDays}
          title="No weekly routine generated yet"
          description="Assign a few marker domains, then generate a week."
        />
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Today&apos;s Routine</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">{routine.objective}</p>
        </div>
        <div className="rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
          {routine.targetMinutes} min/day
        </div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Marker</th>
                <th className="w-36 px-2 py-2">Role</th>
                <th className="w-28 px-2 py-2">Domain</th>
                <th className="w-24 px-2 py-2 text-right">Minutes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {routine.items.map((item) => {
                const catalogItem = catalogByKey.get(item.markerKey)
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer transition-colors hover:bg-muted/45"
                    onClick={() => catalogItem && onOpenMarker(catalogItem)}
                  >
                    <td className="px-2 py-3">
                      <div className="font-medium">{catalogItem?.markerTitle ?? item.markerId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.rationale}</div>
                    </td>
                    <td className="px-2 py-3 text-xs">{item.role}</td>
                    <td className="px-2 py-3 text-xs">{getLearningDomainLabel(item.domain)}</td>
                    <td className="px-2 py-3 text-right font-medium tabular-nums">{item.plannedMinutes}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deliverable</div>
            <p className="mt-2 text-sm">{routine.deliverable}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weekly Schedule</div>
            <div className="mt-2 grid gap-2">
              {routine.dailySchedule.slice(0, 7).map((day) => (
                <div key={day.dayIndex} className="grid grid-cols-[2.5rem_1fr] gap-2 text-xs">
                  <span className="font-semibold">{day.label}</span>
                  <span className="text-muted-foreground">{day.focus}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Review</div>
            <p className="mt-2 text-sm">{routine.reviewQuestion}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatsPanel({ stats }: { stats: LearningStats | null }) {
  const totalMinutes = Math.round((stats?.totalPracticeMs ?? 0) / 60000)
  const recentDays = stats?.dayStats.slice(-14) ?? []
  const maxDay = Math.max(...recentDays.map((day) => day.totalPracticeMs), 1)

  return (
    <div className="rounded-md border bg-background">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Calendar Stats</h2>
      </div>
      <div className="grid gap-3 p-4">
        <Metric label="Practice days" value={stats?.practiceDays ?? 0} />
        <Metric label="Total time" value={`${totalMinutes}m`} />
        <Metric label="Markers touched" value={stats?.practicedMarkerCount ?? 0} />
        <Metric label="Avg progress delta" value={`${(stats?.averageProgressDelta ?? 0).toFixed(1)}%`} />
        <div className="mt-2 flex h-16 items-end gap-1">
          {recentDays.length === 0 ? (
            <div className="flex h-full flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              No logged practice yet
            </div>
          ) : (
            recentDays.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${Math.round(day.totalPracticeMs / 60000)} min`}
                className="min-w-3 flex-1 rounded-t-sm bg-primary/70"
                style={{ height: `${Math.max(8, (day.totalPracticeMs / maxDay) * 64)}px` }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function DomainMarkerTable({
  domain,
  items,
  stateMap,
  onDomainChange,
  onOpenMarker
}: {
  domain: LearningDomain
  items: MarkerCatalogItem[]
  stateMap: Map<string, LearningMarkerState>
  onDomainChange: (item: MarkerCatalogItem, domain: LearningDomain | undefined) => Promise<void>
  onOpenMarker: (item: MarkerCatalogItem) => void
}) {
  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{getLearningDomainLabel(domain)}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <MarkerTable
        items={items}
        stateMap={stateMap}
        emptyText="No markers assigned yet."
        onDomainChange={onDomainChange}
        onOpenMarker={onOpenMarker}
      />
    </div>
  )
}

function MarkerQueue({
  items,
  onDomainChange,
  onOpenMarker
}: {
  items: MarkerCatalogItem[]
  onDomainChange: (item: MarkerCatalogItem, domain: LearningDomain | undefined) => Promise<void>
  onOpenMarker: (item: MarkerCatalogItem) => void
}) {
  return (
    <MarkerTable
      items={items}
      stateMap={new Map()}
      emptyText="Every visible marker has a learning domain."
      onDomainChange={onDomainChange}
      onOpenMarker={onOpenMarker}
    />
  )
}

function MarkerTable({
  items,
  stateMap,
  emptyText,
  onDomainChange,
  onOpenMarker
}: {
  items: MarkerCatalogItem[]
  stateMap: Map<string, LearningMarkerState>
  emptyText: string
  onDomainChange: (item: MarkerCatalogItem, domain: LearningDomain | undefined) => Promise<void>
  onOpenMarker: (item: MarkerCatalogItem) => void
}) {
  if (items.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Marker</th>
            <th className="w-36 px-3 py-2">Source</th>
            <th className="w-28 px-3 py-2">Time</th>
            <th className="w-28 px-3 py-2">Dominance</th>
            <th className="w-36 px-3 py-2">Next Due</th>
            <th className="w-44 px-3 py-2">Domain</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const learningState = stateMap.get(item.markerKey)
            return (
              <tr key={item.markerKey} className="transition-colors hover:bg-muted/45">
                <td className="max-w-0 px-3 py-3">
                  <button className="block w-full min-w-0 text-left" onClick={() => onOpenMarker(item)}>
                    <div className="truncate font-medium">{item.markerTitle}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{item.sourceTitle}</td>
                <td className="px-3 py-3 font-medium tabular-nums">{formatTimeRange(item)}</td>
                <td className="px-3 py-3">
                  <ProgressPill value={item.marker.completionDegree ?? 0} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{formatDue(learningState?.dueAt)}</td>
                <td className="px-3 py-3">
                  <LearningDomainSelect
                    value={item.marker.learning?.domain}
                    className="w-full"
                    onChange={(domain) => void onDomainChange(item, domain)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PracticeMarkerModal({
  item,
  sessionId,
  state,
  storageHandle,
  onClose,
  onSaved
}: {
  item: MarkerCatalogItem
  sessionId?: string
  state?: LearningMarkerState
  storageHandle: FileSystemDirectoryHandle
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [progress, setProgress] = useState(item.marker.completionDegree ?? 0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) {
      lastTickRef.current = null
      return
    }
    lastTickRef.current = Date.now()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastTickRef.current = Date.now()
        return
      }
      const now = Date.now()
      const last = lastTickRef.current ?? now
      setElapsedMs((current) => current + Math.max(0, now - last))
      lastTickRef.current = now
    }, 1000)
    return () => window.clearInterval(interval)
  }, [running])

  const save = async () => {
    setSaving(true)
    try {
      await recordPracticeProgress(storageHandle, item, {
        sessionId,
        durationMs: elapsedMs,
        progressBefore: item.marker.completionDegree ?? 0,
        progressAfter: progress
      })
      await updateCatalogMarkerProgress(item, progress)
      await onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border bg-background shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{item.sourceTitle}</div>
            <h2 className="truncate text-lg font-semibold">{item.markerTitle}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Practice Item
              </div>
              <div className="text-sm">{item.annotation?.text || item.marker.learning?.practiceUseCase || 'No notes yet.'}</div>
            </div>

            <InfoBlock title="Practice Prompt" text={item.marker.learning?.practicePrompt} />
            <InfoBlock title="Extraction Prompt" text={item.marker.learning?.extractionPrompt} />
            <InfoBlock title="Suggested Output" text={item.marker.learning?.suggestedOutput} />

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Constraints</div>
              <div className="flex flex-wrap gap-1">
                {(item.marker.learning?.suggestedConstraints ?? []).length === 0 ? (
                  <span className="text-sm text-muted-foreground">No constraints saved.</span>
                ) : (
                  item.marker.learning?.suggestedConstraints?.map((constraint) => (
                    <span key={constraint} className="rounded-md bg-background px-2 py-1 text-xs">
                      {constraint}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Timer</div>
              <div className="text-3xl font-semibold tabular-nums">{formatElapsed(elapsedMs)}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setRunning((current) => !current)} className="gap-2">
                  {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {running ? 'Pause' : 'Start'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setElapsedMs(0)}>Reset</Button>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">Dominance</span>
                <span className="font-semibold tabular-nums">{progress}%</span>
              </div>
              <Slider value={[progress]} min={0} max={100} step={1} onValueChange={([value]) => setProgress(value)} />
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedule State</div>
              <div className="space-y-1 text-muted-foreground">
                <div>Last practiced: {formatDateTime(state?.lastPracticedAt)}</div>
                <div>Next due: {formatDateTime(state?.dueAt)}</div>
                <div>Total time: {Math.round((state?.totalPracticeMs ?? 0) / 60000)}m</div>
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="w-full gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving' : 'Save Progress'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoBlock({ title, text }: { title: string; text?: string }) {
  if (!text) return null
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <p className="text-sm">{text}</p>
    </div>
  )
}

function ProgressPill({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums">{value}%</span>
    </div>
  )
}

function formatTimeRange(item: MarkerCatalogItem): string {
  return `${formatTime(item.marker.startTime)}-${formatTime(item.marker.endTime)}`
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatDue(timestamp?: number): string {
  if (!timestamp) return 'New'
  const now = Date.now()
  if (timestamp <= now) return 'Due'
  const days = Math.ceil((timestamp - now) / (24 * 60 * 60 * 1000))
  return `${days}d`
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) return 'Never'
  return new Date(timestamp).toLocaleDateString()
}
