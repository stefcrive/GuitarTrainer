import type { MarkerLearningMetadata } from './learning'
import type { Instrument } from '@/lib/instrument-audio'

export type DocumentFormat = 'pdf' | 'txt' | 'md' | 'tab' | 'docx' | 'musicxml' | 'xml' | 'mxl' | 'jpg' | 'jpeg' | 'png' | 'gif' | 'webp'
export interface LibraryDocument {
  name: string
  path: string
  format: DocumentFormat
  handle: FileSystemFileHandle
}
export interface DocumentRegion { x: number; y: number; width: number; height: number }
export interface ScorePosition { page: number; x: number; y: number; height: number; system: string }
export type MeterSource = 'recognized' | 'inferred' | 'assumed' | 'carried' | 'manual'
export interface ScoreNote {
  id: string
  start: number // quarter-note beats, including rests and simultaneous voices
  duration: number
  tuplet?: { actual: number; normal: number }
  midi: number | null
  part?: string
  string?: number
  fret?: number
  measure?: number
  position?: ScorePosition
}
export interface ScoreMeasure {
  label: string
  start: number
  end: number
  beats: number
  beatType: number
  implicit?: boolean
  meterSource?: MeterSource
  position?: ScorePosition
}
export interface DocumentScore {
  chords?: ScoreChord[]
  notes: ScoreNote[]
  measures: ScoreMeasure[]
  beats: number | null
  beatType: number | null
  bpm: number
  reviewed: boolean
  source: 'audiveris' | 'musicxml' | 'tab-ocr' | 'manual' | 'gpt-vision'
  musicXml?: string
  model?: string
  musicXmlFiles?: { name: string; xml: string }[]
  coverageWarning?: string
  sourceImage?: string
  warnings: string[]
  meterSource?: MeterSource
  sourcePages?: { page: number; region?: DocumentRegion }[]
  playback?: { from: number; to: number; loop: boolean; octave: number; click?: boolean; autoscroll?: boolean; firstMeasure?: number; lastMeasure?: number; instrument?: Instrument; chordInstrument?: Instrument; melodyEnabled?: boolean; chordsEnabled?: boolean }
}
export interface ScoreChord {
  id: string
  name: string
  start: number
  duration: number
  measure: number
  midi: number[]
  origin: 'symbol' | 'diagram' | 'inferred' | 'manual'
  confidence: number
  reason: string
}
export interface DocumentMarker {
  id: string
  title: string
  page: number // PDF page, or text section (1-based)
  endPage: number
  kind: 'section' | 'notation' | 'tab' | 'note'
  notes: string
  tags: string[]
  learning?: MarkerLearningMetadata
  completionDegree: number
  region?: DocumentRegion
  score?: DocumentScore
  origin: 'manual' | 'outline' | 'index' | 'heading' | 'detection'
}
export interface DocumentState {
  version: 1
  markers: DocumentMarker[]
  page: number
  fingerprint: string
  ocrPages?: Record<number, string>
}
export interface MarkerCandidate { title: string; page: number; origin: DocumentMarker['origin'] }
