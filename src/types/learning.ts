export const LEARNING_DOMAIN_OPTIONS = [
  { value: 'repertoire', label: 'Repertoire' },
  { value: 'musical-device', label: 'Musical devices' },
  { value: 'training', label: 'Training' }
] as const

export type LearningDomain = typeof LEARNING_DOMAIN_OPTIONS[number]['value']

export type LearningPrimaryDomain =
  | 'Repertoire'
  | 'Musical Devices'
  | 'Technique & Exercises'
  | 'Harmony & Voice Leading'
  | 'Ear Training & Audiation'
  | 'Improvisation'
  | 'Composition & Arrangement'
  | 'Rhythm, Time & Groove'
  | 'Fretboard Navigation'
  | 'Performance & Playing With Others'
  | 'Theory Reference'
  | 'Workflow / Practice Method'

export type WeeklyPracticeRole =
  | 'Main Repertoire Object'
  | 'Repertoire Support'
  | 'Device Extraction'
  | 'Composition Assignment'
  | 'Arrangement Assignment'
  | 'Technique Maintenance'
  | 'Technical Bottleneck Solver'
  | 'Ear/Fretboard Integration'
  | 'Improvisation Constraint'
  | 'Harmony/Voice-Leading Study'
  | 'Rhythm/Time Study'
  | 'Performance Preparation'
  | 'Theory Reference Only'
  | 'Practice Workflow Support'

export type DifficultyLevel =
  | 'Beginner'
  | 'Early Intermediate'
  | 'Intermediate'
  | 'Advanced Intermediate'
  | 'Advanced'

export type LearningRating = 'again' | 'hard' | 'good' | 'easy'

export interface MarkerLearningMetadata {
  domain?: LearningDomain
  primaryDomain?: LearningPrimaryDomain
  secondaryDomains?: LearningPrimaryDomain[]
  topics?: string[]
  musicalFunction?: string
  practiceUseCase?: string
  weeklyPracticeRole?: WeeklyPracticeRole
  difficultyLevel?: DifficultyLevel
  requiredPrerequisites?: string[]
  suggestedOutput?: string
  repertoireRelevance?: number
  compositionRelevance?: number
  playingWithOthersRelevance?: number
  allFourthsRelevance?: number
  intervalFunctionRelevance?: number
  suggestedConstraints?: string[]
  extractionPrompt?: string
  practicePrompt?: string
  relatedMarkerLinks?: string[]
  priorityScore?: number
  notesForWeeklyPlanner?: string
}

export interface LearningMarkerState {
  markerKey: string
  contentPath: string
  markerId: string
  domain?: LearningDomain
  stability: number
  difficulty: number
  dueAt?: number
  lastPracticedAt?: number
  totalPracticeMs: number
  repetitions: number
  lapses: number
  updatedAt: number
}

export interface LearningEventRecord {
  id: string
  markerKey: string
  sessionId?: string
  eventType: 'time' | 'progress' | 'rating' | 'completion'
  occurredAt: number
  durationMs?: number
  progressBefore?: number
  progressAfter?: number
  rating?: LearningRating
  notes?: string
}

export interface LearningRoutineItem {
  id: string
  markerKey: string
  contentPath: string
  markerId: string
  domain: LearningDomain
  role: WeeklyPracticeRole
  plannedMinutes: number
  rationale: string
  sortOrder: number
}

export interface LearningRoutine {
  id: string
  routineDate: string
  targetMinutes: number
  objective: string
  deliverable: string
  status: 'planned' | 'active' | 'completed'
  createdAt: number
  updatedAt: number
  completedAt?: number
  items: LearningRoutineItem[]
  dailySchedule: WeeklyPracticeDay[]
  recordingAssignment: string
  reviewQuestion: string
}

export interface WeeklyPracticeDay {
  dayIndex: number
  label: string
  focus: string
  minutes: number
  blocks: WeeklyPracticeBlock[]
}

export interface WeeklyPracticeBlock {
  label: string
  minutes: number
  markerKey?: string
}

export interface LearningStats {
  practiceDays: number
  totalPracticeMs: number
  practicedMarkerCount: number
  averageProgressDelta: number
  dayStats: {
    date: string
    totalPracticeMs: number
    markerCount: number
    progressDelta: number
  }[]
}

export function getLearningDomainLabel(domain?: LearningDomain): string {
  return LEARNING_DOMAIN_OPTIONS.find((option) => option.value === domain)?.label ?? 'Uncategorized'
}
