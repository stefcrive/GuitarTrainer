'use client'

import type {
  LearningDomain,
  LearningMarkerState,
  LearningRating,
  LearningRoutine,
  LearningRoutineItem,
  LearningStats,
  WeeklyPracticeBlock,
  WeeklyPracticeDay,
  WeeklyPracticeRole
} from '@/types/learning'
import { getLearningDomainLabel } from '@/types/learning'
import type { MarkerCatalogItem } from '@/services/marker-catalog'
import {
  getDatabaseContext,
  queryAll,
  queryOne,
  runStatement,
  saveDatabase
} from '@/services/local-sql-db'

type LearningStateRow = {
  marker_key: string
  content_path: string
  marker_id: string
  domain: string | null
  stability: number
  difficulty: number
  due_at: number | null
  last_practiced_at: number | null
  total_practice_ms: number
  repetitions: number
  lapses: number
  updated_at: number
}

type LearningSessionRow = {
  id: string
  routine_date: string
  target_minutes: number
  objective: string
  deliverable: string
  status: 'planned' | 'active' | 'completed'
  daily_schedule: string
  recording_assignment: string
  review_question: string
  created_at: number
  updated_at: number
  completed_at: number | null
}

type LearningSessionItemRow = {
  id: string
  session_id: string
  marker_key: string
  content_path: string
  marker_id: string
  domain: LearningDomain
  role: WeeklyPracticeRole
  planned_minutes: number
  rationale: string
  sort_order: number
  completed_at: number | null
}

interface ScoredCandidate {
  item: MarkerCatalogItem
  state?: LearningMarkerState
  domain: LearningDomain
  role: WeeklyPracticeRole
  score: number
  rationale: string
}

export interface RecordPracticeProgressInput {
  sessionId?: string
  durationMs: number
  progressBefore: number
  progressAfter: number
  notes?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function loadLearningStateMap(
  directoryHandle: FileSystemDirectoryHandle
): Promise<Map<string, LearningMarkerState>> {
  const { db } = await getDatabaseContext(directoryHandle)
  const rows = queryAll<LearningStateRow>(
    db,
    `SELECT marker_key, content_path, marker_id, domain, stability, difficulty, due_at,
            last_practiced_at, total_practice_ms, repetitions, lapses, updated_at
     FROM marker_learning_state`
  )
  return new Map(rows.map((row) => [row.marker_key, mapLearningState(row)]))
}

export async function loadLatestLearningRoutine(
  directoryHandle: FileSystemDirectoryHandle
): Promise<LearningRoutine | null> {
  const { db } = await getDatabaseContext(directoryHandle)
  const session = queryOne<LearningSessionRow>(
    db,
    `SELECT id, routine_date, target_minutes, objective, deliverable, status, daily_schedule,
            recording_assignment, review_question, created_at, updated_at, completed_at
     FROM learning_sessions
     ORDER BY created_at DESC
     LIMIT 1`
  )
  if (!session) return null

  const items = queryAll<LearningSessionItemRow>(
    db,
    `SELECT id, session_id, marker_key, content_path, marker_id, domain, role,
            planned_minutes, rationale, sort_order, completed_at
     FROM learning_session_items
     WHERE session_id = ?
     ORDER BY sort_order`,
    [session.id]
  )

  return mapRoutine(session, items)
}

export async function generateAndSaveWeeklyRoutine(
  directoryHandle: FileSystemDirectoryHandle,
  catalog: MarkerCatalogItem[],
  targetMinutes: number
): Promise<LearningRoutine> {
  const stateMap = await loadLearningStateMap(directoryHandle)
  const routine = generateWeeklyRoutine(catalog, stateMap, targetMinutes)
  await saveLearningRoutine(directoryHandle, routine)
  return routine
}

export function generateWeeklyRoutine(
  catalog: MarkerCatalogItem[],
  stateMap: Map<string, LearningMarkerState>,
  targetMinutes: number
): LearningRoutine {
  const now = Date.now()
  const clampedTarget = Math.max(15, Math.min(180, Math.round(targetMinutes || 45)))
  const candidates = observeCandidates(catalog, stateMap, now)
  const picked = draftRoutineCandidates(candidates)
  const repaired = repairRoutineDuration(picked, clampedTarget)
  const items = repaired.map((candidate, index) => ({
    id: crypto.randomUUID(),
    markerKey: candidate.item.markerKey,
    contentPath: candidate.item.contentPath,
    markerId: candidate.item.marker.id,
    domain: candidate.domain,
    role: candidate.role,
    plannedMinutes: candidate.plannedMinutes,
    rationale: candidate.rationale,
    sortOrder: index
  }))

  const main = picked.find((candidate) => candidate.domain === 'repertoire')?.item ?? picked[0]?.item
  const device = picked.find((candidate) => candidate.domain === 'musical-device')?.item
  const objective = main
    ? `Move ${main.markerTitle} toward a weekly output using repertoire, device extraction, and a recorded review.`
    : 'Build a focused weekly practice thread from assigned learning markers.'
  const deliverable = main?.marker.learning?.suggestedOutput
    ?? device?.marker.learning?.suggestedOutput
    ?? 'Record one short take and write one sentence about what should improve next week.'

  return {
    id: crypto.randomUUID(),
    routineDate: formatDate(now),
    targetMinutes: clampedTarget,
    objective,
    deliverable,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
    items,
    dailySchedule: buildDailySchedule(items, catalog, clampedTarget),
    recordingAssignment: `Record a 60-90 second take that proves the week's deliverable: ${deliverable}`,
    reviewQuestion: 'What got more musical, and what constraint should stay in the routine next week?'
  }
}

export async function saveLearningRoutine(
  directoryHandle: FileSystemDirectoryHandle,
  routine: LearningRoutine
): Promise<void> {
  const context = await getDatabaseContext(directoryHandle)
  runStatement(
    context.db,
    `INSERT INTO learning_sessions
      (id, routine_date, target_minutes, objective, deliverable, status, daily_schedule,
       recording_assignment, review_question, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       routine_date = excluded.routine_date,
       target_minutes = excluded.target_minutes,
       objective = excluded.objective,
       deliverable = excluded.deliverable,
       status = excluded.status,
       daily_schedule = excluded.daily_schedule,
       recording_assignment = excluded.recording_assignment,
       review_question = excluded.review_question,
       updated_at = excluded.updated_at,
       completed_at = excluded.completed_at`,
    [
      routine.id,
      routine.routineDate,
      routine.targetMinutes,
      routine.objective,
      routine.deliverable,
      routine.status,
      JSON.stringify(routine.dailySchedule),
      routine.recordingAssignment,
      routine.reviewQuestion,
      routine.createdAt,
      Date.now(),
      routine.completedAt ?? null
    ]
  )
  runStatement(context.db, 'DELETE FROM learning_session_items WHERE session_id = ?', [routine.id])
  for (const item of routine.items) {
    runStatement(
      context.db,
      `INSERT INTO learning_session_items
        (id, session_id, marker_key, content_path, marker_id, domain, role,
         planned_minutes, rationale, sort_order, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        routine.id,
        item.markerKey,
        item.contentPath,
        item.markerId,
        item.domain,
        item.role,
        item.plannedMinutes,
        item.rationale,
        item.sortOrder,
        null
      ]
    )
  }
  await saveDatabase(context)
}

export async function recordPracticeProgress(
  directoryHandle: FileSystemDirectoryHandle,
  item: MarkerCatalogItem,
  input: RecordPracticeProgressInput
): Promise<LearningMarkerState> {
  const context = await getDatabaseContext(directoryHandle)
  const now = Date.now()
  const rating = progressToRating(input.progressBefore, input.progressAfter)
  const existing = queryOne<LearningStateRow>(
    context.db,
    `SELECT marker_key, content_path, marker_id, domain, stability, difficulty, due_at,
            last_practiced_at, total_practice_ms, repetitions, lapses, updated_at
     FROM marker_learning_state
     WHERE marker_key = ?`,
    [item.markerKey]
  )
  const next = nextLearningState(existing ? mapLearningState(existing) : null, item, {
    now,
    rating,
    durationMs: input.durationMs
  })

  runStatement(
    context.db,
    `INSERT INTO marker_learning_state
      (marker_key, content_path, marker_id, domain, stability, difficulty, due_at,
       last_practiced_at, total_practice_ms, repetitions, lapses, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(marker_key) DO UPDATE SET
       content_path = excluded.content_path,
       marker_id = excluded.marker_id,
       domain = excluded.domain,
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       due_at = excluded.due_at,
       last_practiced_at = excluded.last_practiced_at,
       total_practice_ms = excluded.total_practice_ms,
       repetitions = excluded.repetitions,
       lapses = excluded.lapses,
       updated_at = excluded.updated_at`,
    [
      next.markerKey,
      next.contentPath,
      next.markerId,
      next.domain ?? null,
      next.stability,
      next.difficulty,
      next.dueAt ?? null,
      next.lastPracticedAt ?? null,
      next.totalPracticeMs,
      next.repetitions,
      next.lapses,
      next.updatedAt
    ]
  )

  runStatement(
    context.db,
    `INSERT INTO learning_events
      (id, marker_key, session_id, event_type, occurred_at, duration_ms,
       progress_before, progress_after, rating, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      item.markerKey,
      input.sessionId ?? null,
      input.progressBefore === input.progressAfter ? 'time' : 'progress',
      now,
      Math.max(0, Math.round(input.durationMs)),
      input.progressBefore,
      input.progressAfter,
      rating,
      input.notes ?? null
    ]
  )

  if (input.sessionId) {
    runStatement(
      context.db,
      `UPDATE learning_session_items
       SET completed_at = COALESCE(completed_at, ?)
       WHERE session_id = ? AND marker_key = ?`,
      [now, input.sessionId, item.markerKey]
    )
  }

  await saveDatabase(context)
  return next
}

export async function loadLearningStats(
  directoryHandle: FileSystemDirectoryHandle
): Promise<LearningStats> {
  const { db } = await getDatabaseContext(directoryHandle)
  const rows = queryAll<{
    marker_key: string
    occurred_at: number
    duration_ms: number | null
    progress_before: number | null
    progress_after: number | null
  }>(
    db,
    `SELECT marker_key, occurred_at, duration_ms, progress_before, progress_after
     FROM learning_events
     ORDER BY occurred_at DESC`
  )
  const dayMap = new Map<string, {
    totalPracticeMs: number
    markerKeys: Set<string>
    progressDelta: number
    progressEventCount: number
  }>()
  const markerKeys = new Set<string>()
  let totalPracticeMs = 0
  let deltaTotal = 0
  let deltaCount = 0

  for (const row of rows) {
    const date = formatDate(row.occurred_at)
    const day = dayMap.get(date) ?? {
      totalPracticeMs: 0,
      markerKeys: new Set<string>(),
      progressDelta: 0,
      progressEventCount: 0
    }
    const duration = Math.max(0, Number(row.duration_ms ?? 0))
    day.totalPracticeMs += duration
    day.markerKeys.add(row.marker_key)
    markerKeys.add(row.marker_key)
    totalPracticeMs += duration

    if (typeof row.progress_before === 'number' && typeof row.progress_after === 'number') {
      const delta = row.progress_after - row.progress_before
      day.progressDelta += delta
      day.progressEventCount += 1
      deltaTotal += delta
      deltaCount += 1
    }
    dayMap.set(date, day)
  }

  return {
    practiceDays: Array.from(dayMap.values()).filter((day) => day.totalPracticeMs > 0).length,
    totalPracticeMs,
    practicedMarkerCount: markerKeys.size,
    averageProgressDelta: deltaCount > 0 ? deltaTotal / deltaCount : 0,
    dayStats: Array.from(dayMap.entries())
      .map(([date, day]) => ({
        date,
        totalPracticeMs: day.totalPracticeMs,
        markerCount: day.markerKeys.size,
        progressDelta: day.progressEventCount > 0 ? day.progressDelta / day.progressEventCount : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-28)
  }
}

function observeCandidates(
  catalog: MarkerCatalogItem[],
  stateMap: Map<string, LearningMarkerState>,
  now: number
): ScoredCandidate[] {
  return catalog
    .filter((item) => Boolean(item.marker.learning?.domain))
    .map((item) => scoreCandidate(item, stateMap.get(item.markerKey), now))
    .sort((a, b) => b.score - a.score)
}

function scoreCandidate(
  item: MarkerCatalogItem,
  state: LearningMarkerState | undefined,
  now: number
): ScoredCandidate {
  const domain = item.marker.learning?.domain as LearningDomain
  const completion = item.marker.completionDegree ?? 0
  const priority = clamp(item.marker.learning?.priorityScore ?? inferPriority(item), 0, 5)
  const role = item.marker.learning?.weeklyPracticeRole ?? inferRole(item)
  const dueAt = state?.dueAt
  const due = !dueAt || dueAt <= now
  const daysUntilDue = dueAt ? Math.max(0, Math.ceil((dueAt - now) / DAY_MS)) : 0
  const daysSincePractice = state?.lastPracticedAt ? Math.max(0, (now - state.lastPracticedAt) / DAY_MS) : 30
  const lowDominance = (100 - completion) / 100
  const domainWeight = domain === 'repertoire' ? 8 : domain === 'musical-device' ? 7 : 6
  const roleWeight = getRoleWeight(role)
  const topicWeight = hasHighValueTopic(item) ? 2 : 0
  const score = domainWeight
    + roleWeight
    + priority * 2
    + lowDominance * 8
    + (due ? 10 : -daysUntilDue)
    + Math.min(daysSincePractice / 3, 5)
    + topicWeight
  const reasons = [
    due ? 'due now' : `due in ${daysUntilDue}d`,
    completion < 60 ? 'low dominance' : 'stable dominance',
    `${getLearningDomainLabel(domain)} role`,
    priority >= 4 ? 'high weekly priority' : null,
    topicWeight ? 'matches all-fourths/interval goals' : null
  ].filter(Boolean)

  return {
    item,
    state,
    domain,
    role,
    score,
    rationale: reasons.join(', ')
  }
}

function draftRoutineCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const picked: ScoredCandidate[] = []
  const pick = (predicate: (candidate: ScoredCandidate) => boolean) => {
    const candidate = candidates.find((item) =>
      predicate(item) && !picked.some((pickedItem) => pickedItem.item.markerKey === item.item.markerKey)
    )
    if (candidate) picked.push(candidate)
  }

  pick((candidate) => candidate.role === 'Main Repertoire Object')
  pick((candidate) => candidate.domain === 'repertoire')
  pick((candidate) => candidate.role === 'Device Extraction' || candidate.domain === 'musical-device')
  pick((candidate) => candidate.role === 'Technical Bottleneck Solver' || candidate.role === 'Technique Maintenance')
  pick((candidate) => candidate.role === 'Ear/Fretboard Integration')
  pick((candidate) => candidate.role === 'Composition Assignment' || candidate.role === 'Arrangement Assignment')

  for (const candidate of candidates) {
    if (picked.length >= 6) break
    if (picked.some((pickedItem) => pickedItem.item.markerKey === candidate.item.markerKey)) continue
    picked.push(candidate)
  }

  return picked.slice(0, 6)
}

function repairRoutineDuration(
  candidates: ScoredCandidate[],
  targetMinutes: number
): Array<ScoredCandidate & { plannedMinutes: number }> {
  if (candidates.length === 0) return []
  const roleMinutes = candidates.map((candidate) => baseMinutesForCandidate(candidate))
  const total = roleMinutes.reduce((sum, minutes) => sum + minutes, 0)
  const scale = targetMinutes / total
  let planned = roleMinutes.map((minutes) => Math.max(5, Math.round(minutes * scale)))
  let difference = targetMinutes - planned.reduce((sum, minutes) => sum + minutes, 0)
  let index = 0
  while (difference !== 0 && planned.length > 0) {
    const direction = difference > 0 ? 1 : -1
    if (planned[index] + direction >= 5) {
      planned[index] += direction
      difference -= direction
    }
    index = (index + 1) % planned.length
  }
  return candidates.map((candidate, candidateIndex) => ({
    ...candidate,
    plannedMinutes: planned[candidateIndex]
  }))
}

function buildDailySchedule(
  routineItems: LearningRoutineItem[],
  catalog: MarkerCatalogItem[],
  targetMinutes: number
): WeeklyPracticeDay[] {
  const catalogByKey = new Map(catalog.map((item) => [item.markerKey, item]))
  const findItem = (predicate: (item: LearningRoutineItem) => boolean) => routineItems.find(predicate)
  const technique = findItem((item) => item.domain === 'training')
  const repertoire = findItem((item) => item.domain === 'repertoire') ?? routineItems[0]
  const device = findItem((item) => item.domain === 'musical-device')
  const application = findItem((item) =>
    item.role === 'Composition Assignment' || item.role === 'Arrangement Assignment'
  ) ?? device ?? repertoire

  const template = [
    { label: 'Technique maintenance', minutes: 10, markerKey: technique?.markerKey },
    { label: 'Ear/fretboard integration', minutes: 20, markerKey: technique?.markerKey ?? device?.markerKey },
    { label: 'Repertoire', minutes: 30, markerKey: repertoire?.markerKey },
    { label: 'Application', minutes: 20, markerKey: application?.markerKey },
    { label: 'Recording/review', minutes: 10, markerKey: repertoire?.markerKey ?? application?.markerKey }
  ]
  const scaled = scaleBlocks(template, targetMinutes)
  const focusLabels = [
    'Map the material',
    'Slow accuracy',
    'Connect device to tune',
    'Application draft',
    'Record a check take',
    'Repair weak spots',
    'Final short take'
  ]

  return focusLabels.map((focus, index) => ({
    dayIndex: index,
    label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
    focus,
    minutes: targetMinutes,
    blocks: scaled.map((block) => ({
      ...block,
      label: block.markerKey
        ? `${block.label}: ${catalogByKey.get(block.markerKey)?.markerTitle ?? 'Selected marker'}`
        : block.label
    }))
  }))
}

function scaleBlocks(blocks: WeeklyPracticeBlock[], targetMinutes: number): WeeklyPracticeBlock[] {
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0)
  const scale = targetMinutes / total
  let scaled = blocks.map((block) => ({
    ...block,
    minutes: Math.max(3, Math.round(block.minutes * scale))
  }))
  let difference = targetMinutes - scaled.reduce((sum, block) => sum + block.minutes, 0)
  let index = 0
  while (difference !== 0 && scaled.length > 0) {
    const direction = difference > 0 ? 1 : -1
    if (scaled[index].minutes + direction >= 3) {
      scaled[index].minutes += direction
      difference -= direction
    }
    index = (index + 1) % scaled.length
  }
  return scaled
}

function nextLearningState(
  previous: LearningMarkerState | null,
  item: MarkerCatalogItem,
  params: {
    now: number
    rating: LearningRating
    durationMs: number
  }
): LearningMarkerState {
  const currentStability = previous?.stability || Math.max(0.5, (item.marker.completionDegree ?? 0) / 20)
  const currentDifficulty = previous?.difficulty || 5
  const ratingMultiplier = params.rating === 'again'
    ? 0.45
    : params.rating === 'hard'
      ? 1.2
      : params.rating === 'easy'
        ? 3.2
        : 2.1
  const stability = params.rating === 'again'
    ? Math.max(0.25, currentStability * ratingMultiplier)
    : Math.min(365, Math.max(1, currentStability * ratingMultiplier))
  const difficulty = clamp(
    currentDifficulty + (params.rating === 'again' ? 1 : params.rating === 'hard' ? 0.35 : params.rating === 'easy' ? -0.65 : -0.25),
    1,
    10
  )
  const intervalDays = params.rating === 'again' ? 1 : Math.max(1, Math.round(stability))

  return {
    markerKey: item.markerKey,
    contentPath: item.contentPath,
    markerId: item.marker.id,
    domain: item.marker.learning?.domain,
    stability,
    difficulty,
    dueAt: params.now + intervalDays * DAY_MS,
    lastPracticedAt: params.now,
    totalPracticeMs: (previous?.totalPracticeMs ?? 0) + Math.max(0, Math.round(params.durationMs)),
    repetitions: (previous?.repetitions ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (params.rating === 'again' ? 1 : 0),
    updatedAt: params.now
  }
}

function progressToRating(before: number, after: number): LearningRating {
  const delta = after - before
  if (delta < 0 || after < 25) return 'again'
  if (after < 55 || delta <= 2) return 'hard'
  if (after >= 85 && delta >= 0) return 'easy'
  return 'good'
}

function mapLearningState(row: LearningStateRow): LearningMarkerState {
  return {
    markerKey: row.marker_key,
    contentPath: row.content_path,
    markerId: row.marker_id,
    domain: row.domain as LearningDomain | undefined,
    stability: Number(row.stability ?? 0),
    difficulty: Number(row.difficulty ?? 5),
    dueAt: row.due_at ?? undefined,
    lastPracticedAt: row.last_practiced_at ?? undefined,
    totalPracticeMs: Number(row.total_practice_ms ?? 0),
    repetitions: Number(row.repetitions ?? 0),
    lapses: Number(row.lapses ?? 0),
    updatedAt: Number(row.updated_at ?? Date.now())
  }
}

function mapRoutine(session: LearningSessionRow, items: LearningSessionItemRow[]): LearningRoutine {
  return {
    id: session.id,
    routineDate: session.routine_date,
    targetMinutes: session.target_minutes,
    objective: session.objective,
    deliverable: session.deliverable,
    status: session.status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    completedAt: session.completed_at ?? undefined,
    items: items.map((item) => ({
      id: item.id,
      markerKey: item.marker_key,
      contentPath: item.content_path,
      markerId: item.marker_id,
      domain: item.domain,
      role: item.role,
      plannedMinutes: item.planned_minutes,
      rationale: item.rationale,
      sortOrder: item.sort_order
    })),
    dailySchedule: parseSchedule(session.daily_schedule),
    recordingAssignment: session.recording_assignment,
    reviewQuestion: session.review_question
  }
}

function parseSchedule(value: string): WeeklyPracticeDay[] {
  try {
    const parsed = JSON.parse(value) as WeeklyPracticeDay[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function inferPriority(item: MarkerCatalogItem): number {
  const learning = item.marker.learning
  const relevance = [
    learning?.repertoireRelevance,
    learning?.compositionRelevance,
    learning?.playingWithOthersRelevance,
    learning?.intervalFunctionRelevance,
    learning?.allFourthsRelevance
  ].filter((value): value is number => typeof value === 'number')
  if (relevance.length > 0) {
    return Math.round(relevance.reduce((sum, value) => sum + value, 0) / relevance.length)
  }
  if (item.marker.learning?.domain === 'repertoire') return 4
  if (item.marker.learning?.domain === 'musical-device') return 4
  return 3
}

function inferRole(item: MarkerCatalogItem): WeeklyPracticeRole {
  if (item.marker.learning?.domain === 'repertoire') return 'Repertoire Support'
  if (item.marker.learning?.domain === 'musical-device') return 'Device Extraction'
  return 'Technique Maintenance'
}

function getRoleWeight(role: WeeklyPracticeRole): number {
  switch (role) {
    case 'Main Repertoire Object':
      return 7
    case 'Device Extraction':
    case 'Composition Assignment':
    case 'Arrangement Assignment':
      return 5
    case 'Ear/Fretboard Integration':
    case 'Performance Preparation':
      return 4
    case 'Technical Bottleneck Solver':
      return 3
    case 'Theory Reference Only':
      return -5
    default:
      return 2
  }
}

function baseMinutesForCandidate(candidate: ScoredCandidate): number {
  if (candidate.domain === 'repertoire') return 24
  if (candidate.role === 'Ear/Fretboard Integration') return 16
  if (candidate.domain === 'musical-device') return 14
  return 10
}

function hasHighValueTopic(item: MarkerCatalogItem): boolean {
  const text = [
    ...item.tags,
    item.marker.learning?.musicalFunction,
    item.marker.learning?.practiceUseCase
  ].join(' ').toLowerCase()
  return ['all-fourths', 'all fourths', 'interval', 'guide tone', 'triad', 'voice leading', 'composition'].some((term) =>
    text.includes(term)
  )
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
