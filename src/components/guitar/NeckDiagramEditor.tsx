'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { scaleProgressions } from '@/data/scale-progressions'
import { cn } from '@/lib/utils'
import { ChordPlayer } from '@/components/guitar/ChordPlayer'
import {
  STANDARD_TUNING,
  TOTAL_FRETS,
  type ChordProgressionChord,
  type ChordProgressionDiagram,
  type DiagramType,
  type MarkerDiagram,
  type NeckDiagram
} from '@/types/guitar'
import { calculateIntervalNotes, getIntervalName, getNoteAtFret } from '@/utils/guitar-utils'

const NOTE_OPTIONS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ALL_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const DEFAULT_END_FRET = Math.min(5, TOTAL_FRETS)
const DEFAULT_NECK_NAME = 'Neck diagram'
const DEFAULT_PROGRESSION_NAME = 'Chord progression'
const PREVIEW_NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63,
  'C#': 277.18,
  D: 293.66,
  'D#': 311.13,
  E: 329.63,
  F: 349.23,
  'F#': 369.99,
  G: 392.0,
  'G#': 415.3,
  A: 440.0,
  'A#': 466.16,
  B: 493.88
}
const CHORD_TYPE_OPTIONS = [
  { value: 'major7', label: 'Major 7', symbolSuffix: 'maj7', nameSuffix: 'Major 7' },
  { value: 'minor7', label: 'Minor 7', symbolSuffix: 'm7', nameSuffix: 'minor 7' },
  { value: 'dominant7', label: 'Dominant 7', symbolSuffix: '7', nameSuffix: 'Dominant 7' },
  { value: 'major', label: 'Major', symbolSuffix: '', nameSuffix: 'Major' },
  { value: 'minor', label: 'Minor', symbolSuffix: 'm', nameSuffix: 'minor' },
  { value: 'diminished', label: 'Diminished', symbolSuffix: 'dim', nameSuffix: 'Diminished' },
  { value: 'half-diminished', label: 'Half Diminished', symbolSuffix: 'm7b5', nameSuffix: 'Half Diminished' },
  { value: 'augmented', label: 'Augmented', symbolSuffix: 'aug', nameSuffix: 'Augmented' }
]
const CHORD_TYPE_FROM_TEMPLATE: Record<string, string> = {
  Major: 'major7',
  Minor: 'minor7',
  Dominant: 'dominant7',
  Diminished: 'diminished',
  'Half Diminished': 'half-diminished',
  Augmented: 'augmented'
}
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#'
}
const DEGREE_MAP: Record<number, { prefix: string; numeral: string }> = {
  0: { prefix: '', numeral: 'I' },
  1: { prefix: 'b', numeral: 'II' },
  2: { prefix: '', numeral: 'II' },
  3: { prefix: 'b', numeral: 'III' },
  4: { prefix: '', numeral: 'III' },
  5: { prefix: '', numeral: 'IV' },
  6: { prefix: '#', numeral: 'IV' },
  7: { prefix: '', numeral: 'V' },
  8: { prefix: 'b', numeral: 'VI' },
  9: { prefix: '', numeral: 'VI' },
  10: { prefix: 'b', numeral: 'VII' },
  11: { prefix: '', numeral: 'VII' }
}
const SCALE_INTERVALS: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Melodic Minor': [0, 2, 3, 5, 7, 9, 11]
}

type NeckDiagramEditorProps = {
  diagram: NeckDiagram
  onChange: (diagram: NeckDiagram) => void
  onRemove?: () => void
  className?: string
}

type ChordProgressionDiagramEditorProps = {
  diagram: ChordProgressionDiagram
  onChange: (diagram: ChordProgressionDiagram) => void
  onRemove?: () => void
  className?: string
}

type MarkerDiagramListProps = {
  diagrams: MarkerDiagram[]
  onChange: (diagrams: MarkerDiagram[]) => void
  className?: string
}

function clampFret(value: number) {
  return Math.min(Math.max(0, value), TOTAL_FRETS)
}

function normalizeNeckDiagram(diagram: NeckDiagram): NeckDiagram {
  const startFret = clampFret(Number.isFinite(diagram.startFret) ? diagram.startFret : 0)
  const endFretRaw = clampFret(Number.isFinite(diagram.endFret) ? diagram.endFret : DEFAULT_END_FRET)
  const endFret = Math.max(startFret, endFretRaw)
  const labelMode = diagram.labelMode === 'intervals' ? 'intervals' : 'notes'
  const rootNote = NOTE_OPTIONS.includes(diagram.rootNote) ? diagram.rootNote : 'C'
  const positions = Array.isArray(diagram.positions) ? diagram.positions : []
  const fingerNumbers = Array.isArray(diagram.fingerNumbers) && diagram.fingerNumbers.length === STANDARD_TUNING.length
    ? diagram.fingerNumbers
    : Array(STANDARD_TUNING.length).fill('')
  const name = diagram.name?.trim() ? diagram.name : DEFAULT_NECK_NAME

  return {
    ...diagram,
    type: 'neck',
    name,
    startFret,
    endFret,
    labelMode,
    rootNote,
    positions,
    fingerNumbers
  }
}

function createDefaultNeckDiagram(): NeckDiagram {
  return {
    id: crypto.randomUUID(),
    type: 'neck',
    name: DEFAULT_NECK_NAME,
    startFret: 0,
    endFret: DEFAULT_END_FRET,
    rootNote: 'C',
    labelMode: 'notes',
    positions: [],
    fingerNumbers: Array(STANDARD_TUNING.length).fill('')
  }
}

function normalizeChord(chord: ChordProgressionChord, index: number): ChordProgressionChord {
  return {
    id: chord.id || `chord-${index}`,
    symbol: typeof chord.symbol === 'string' ? chord.symbol : '',
    name: typeof chord.name === 'string' ? chord.name : ''
  }
}

function normalizeProgressionDiagram(diagram: ChordProgressionDiagram): ChordProgressionDiagram {
  const key = NOTE_OPTIONS.includes(diagram.key) ? diagram.key : 'C'
  const name = diagram.name?.trim() ? diagram.name : DEFAULT_PROGRESSION_NAME
  const chords = Array.isArray(diagram.chords)
    ? diagram.chords.map(normalizeChord)
    : []

  return {
    ...diagram,
    type: 'progression',
    name,
    key,
    chords
  }
}

function createDefaultProgressionDiagram(): ChordProgressionDiagram {
  return {
    id: crypto.randomUUID(),
    type: 'progression',
    name: DEFAULT_PROGRESSION_NAME,
    key: 'C',
    chords: []
  }
}

function normalizeNoteName(note: string) {
  if (!note) return null
  const cleaned = note.trim()
  if (!cleaned) return null
  const base = cleaned[0]?.toUpperCase() || ''
  const accidental = cleaned[1] === '#' || cleaned[1] === 'b' ? cleaned[1] : ''
  const candidate = `${base}${accidental}`
  if (NOTE_OPTIONS.includes(candidate)) return candidate
  return FLAT_TO_SHARP[candidate] || null
}

function getNoteIndex(note: string) {
  return NOTE_OPTIONS.indexOf(note)
}

function parseChordRoot(label: string) {
  const match = label.trim().match(/^([A-Ga-g])([#b])?/)
  if (!match) return null
  return normalizeNoteName(`${match[1].toUpperCase()}${match[2] || ''}`)
}

function detectChordQuality(label: string) {
  const value = label.toLowerCase()
  if (value.includes('m7b5') || value.includes('half')) return 'half-diminished'
  if (value.includes('dim')) return 'diminished'
  if (value.includes('aug') || value.includes('+')) return 'augmented'
  if (value.includes('maj')) return 'major'
  if (value.includes('m')) return 'minor'
  if (value.includes('7')) return 'dominant'
  return 'major'
}

function getChordSuffix(symbol: string) {
  const match = symbol.trim().match(/^([A-Ga-g])([#b])?(.*)$/)
  if (!match) return ''
  return (match[3] || '').trim()
}

function getIntervalFunctionLabel(key: string, symbol: string, name: string) {
  const source = symbol || name
  if (!source) return ''
  const chordRoot = parseChordRoot(source)
  const keyRoot = normalizeNoteName(key)
  if (!chordRoot || !keyRoot) return ''
  const chordIndex = getNoteIndex(chordRoot)
  const keyIndex = getNoteIndex(keyRoot)
  if (chordIndex < 0 || keyIndex < 0) return ''
  const interval = (chordIndex - keyIndex + 12) % 12
  const degree = DEGREE_MAP[interval]
  if (!degree) return ''
  const qualitySource = symbol || name
  const quality = detectChordQuality(qualitySource)
  const numeral = ['minor', 'diminished', 'half-diminished'].includes(quality)
    ? degree.numeral.toLowerCase()
    : degree.numeral.toUpperCase()
  const suffix = symbol ? getChordSuffix(symbol) : ''
  return `${degree.prefix}${numeral}${suffix}`
}

function getChordIntervals(symbol: string, name: string) {
  const symbolLower = symbol.toLowerCase()
  const nameLower = name.toLowerCase()
  const combined = `${symbolLower} ${nameLower}`
  const hasMaj7 = combined.includes('maj7') || nameLower.includes('major 7')
  const hasHalfDim = combined.includes('m7b5') || combined.includes('half')
  const hasDim = combined.includes('dim')
  const hasAug = combined.includes('aug') || combined.includes('+')
  const hasMin7 = combined.includes('m7') || nameLower.includes('minor 7')
  const hasDom7 = combined.includes('dominant') || (combined.includes('7') && !hasMaj7 && !hasMin7)
  const hasMinorSymbol = /[a-g][#b]?m(?!aj)/i.test(symbol) || symbolLower.includes('min')
  const hasMinor = nameLower.includes('minor') || hasMinorSymbol

  if (hasMaj7) return [0, 4, 7, 11]
  if (hasHalfDim) return [0, 3, 6, 10]
  if (hasDim) return [0, 3, 6]
  if (hasAug) return [0, 4, 8]
  if (hasMin7) return [0, 3, 7, 10]
  if (hasDom7) return [0, 4, 7, 10]
  if (hasMinor) return [0, 3, 7]
  return [0, 4, 7]
}

function getChordTypeOption(value: string) {
  return CHORD_TYPE_OPTIONS.find(option => option.value === value) || CHORD_TYPE_OPTIONS[0]
}

function buildChordFromSelection(root: string, chordType: string) {
  const typeOption = getChordTypeOption(chordType)
  const symbol = typeOption.symbolSuffix ? `${root}${typeOption.symbolSuffix}` : root
  const name = typeOption.nameSuffix ? `${root} ${typeOption.nameSuffix}` : root
  return {
    id: crypto.randomUUID(),
    symbol,
    name
  }
}

function getReferenceChordRoot(
  key: string,
  parentScale: string,
  modeNumber: number | undefined,
  index: number
) {
  const offsets = SCALE_INTERVALS[parentScale]
  if (!offsets) return null
  const degreeIndex = typeof modeNumber === 'number'
    ? Math.max(0, modeNumber - 1)
    : index
  const offset = offsets[degreeIndex]
  if (offset === undefined) return null
  return calculateIntervalNotes(key, [offset])[0] || key
}

function normalizeMarkerDiagrams(diagrams?: MarkerDiagram[]): MarkerDiagram[] {
  return (diagrams || []).map((diagram) => {
    if ((diagram as ChordProgressionDiagram).type === 'progression') {
      return normalizeProgressionDiagram(diagram as ChordProgressionDiagram)
    }
    return normalizeNeckDiagram(diagram as NeckDiagram)
  })
}

export function NeckDiagramEditor({
  diagram,
  onChange,
  onRemove,
  className
}: NeckDiagramEditorProps) {
  const normalized = normalizeNeckDiagram(diagram)
  const notePlayerRef = useRef<{
    playChord: () => void
    stopChord: () => void
    playNote: (
      frequency: number,
      stringName?: string,
      stringIndex?: number,
      fretNumber?: number,
      octaveOffset?: number,
      noteVolumeOverride?: number
    ) => void
  } | null>(null)
  const frets = Array.from(
    { length: normalized.endFret - normalized.startFret + 1 },
    (_, i) => normalized.startFret + i
  )
  const minWidth = (frets.length + 2) * 48

  const updateDiagram = (next: Partial<NeckDiagram>) => {
    onChange({ ...normalized, ...next })
  }

  const togglePosition = (stringIndex: number, fret: number) => {
    const exists = normalized.positions.some(
      position => position.stringIndex === stringIndex && position.fret === fret
    )
    const nextPositions = exists
      ? normalized.positions.filter(
          position => !(position.stringIndex === stringIndex && position.fret === fret)
        )
      : [...normalized.positions, { stringIndex, fret }]
    updateDiagram({ positions: nextPositions })
  }

  const updateFingerNumber = (stringIndex: number, value: string) => {
    const sanitized = value.toUpperCase().replace(/[^0-9T]/g, '').slice(0, 2)
    const next = [...normalized.fingerNumbers]
    next[stringIndex] = sanitized
    updateDiagram({ fingerNumbers: next })
  }

  return (
    <div className={cn('space-y-3 rounded-md border bg-white/70 dark:bg-gray-900/50 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={normalized.name}
          onChange={(e) => updateDiagram({ name: e.target.value })}
          placeholder="Diagram name"
          className="h-8 max-w-[240px]"
        />
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Frets</span>
          <Select
            value={normalized.startFret.toString()}
            onValueChange={(value) => {
              const startFret = clampFret(Number(value))
              const endFret = Math.max(startFret, normalized.endFret)
              updateDiagram({ startFret, endFret })
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: TOTAL_FRETS + 1 }, (_, i) => i).map(fret => (
                <SelectItem key={fret} value={fret.toString()}>
                  {fret}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">to</span>
          <Select
            value={normalized.endFret.toString()}
            onValueChange={(value) => {
              const endFret = clampFret(Number(value))
              const startFret = Math.min(normalized.startFret, endFret)
              updateDiagram({ startFret, endFret })
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: TOTAL_FRETS + 1 }, (_, i) => i).map(fret => (
                <SelectItem key={fret} value={fret.toString()}>
                  {fret}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">Labels</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={normalized.labelMode === 'notes' ? 'default' : 'outline'}
              onClick={() => updateDiagram({ labelMode: 'notes' })}
            >
              Notes
            </Button>
            <Button
              type="button"
              size="sm"
              variant={normalized.labelMode === 'intervals' ? 'default' : 'outline'}
              onClick={() => updateDiagram({ labelMode: 'intervals' })}
            >
              Intervals
            </Button>
          </div>
          <Select
            value={normalized.rootNote}
            onValueChange={(value) => updateDiagram({ rootNote: value })}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue>Root: {normalized.rootNote}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {NOTE_OPTIONS.map(note => (
                <SelectItem key={note} value={note}>
                  {note}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <div className="min-w-[360px]" style={{ minWidth }}>
          <div className="flex border-b text-xs text-muted-foreground">
            <div className="w-10 text-center py-1">Finger</div>
            <div className="w-12"></div>
            {frets.map(fret => (
              <div key={fret} className="flex-1 text-center py-1">
                {fret}
              </div>
            ))}
          </div>

          {STANDARD_TUNING.map((tuning, stringIndex) => (
            <div key={tuning} className="flex border-b last:border-b-2">
              <div className="w-10 flex items-center justify-center">
                <input
                  type="text"
                  inputMode="numeric"
                  value={normalized.fingerNumbers[stringIndex] || ''}
                  onChange={(e) => updateFingerNumber(stringIndex, e.target.value)}
                  className="h-7 w-8 rounded border text-center text-xs"
                  placeholder="-"
                />
              </div>
              <div className="w-12 flex items-center justify-center font-semibold text-xs">
                {tuning}
              </div>
              {frets.map((fret) => {
                const note = getNoteAtFret(tuning, fret)
                const noteFrequency = PREVIEW_NOTE_FREQUENCIES[note]
                const isSelected = normalized.positions.some(
                  position => position.stringIndex === stringIndex && position.fret === fret
                )
                const label = normalized.labelMode === 'notes'
                  ? note
                  : getIntervalName(note, normalized.rootNote, ALL_INTERVALS)

                return (
                  <div
                    key={`${stringIndex}-${fret}`}
                    className={cn(
                      'flex-1 h-10 flex items-center justify-center border-r relative cursor-pointer',
                      fret === 0 && 'border-r-2 border-r-gray-500',
                      fret === 11 && 'border-r-2 border-r-gray-500',
                      'hover:bg-accent/10',
                      isSelected && 'bg-primary/15'
                    )}
                    onClick={() => {
                      togglePosition(stringIndex, fret)
                      if (noteFrequency && notePlayerRef.current) {
                        notePlayerRef.current.playNote(
                          noteFrequency,
                          tuning,
                          stringIndex,
                          fret
                        )
                      }
                    }}
                  >
                    {stringIndex === 2 && [3, 5, 7, 9, 15].includes(fret) && (
                      <div className="absolute w-3 h-3 rounded-full bg-gray-300"></div>
                    )}
                    {stringIndex === 2 && fret === 12 && (
                      <>
                        <div className="absolute w-3 h-3 rounded-full bg-gray-300 -ml-5"></div>
                        <div className="absolute w-3 h-3 rounded-full bg-gray-300 ml-5"></div>
                      </>
                    )}

                    {isSelected && (
                      <div className="absolute inset-1 flex items-center justify-center rounded bg-primary/20 text-xs font-semibold">
                        {label}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="hidden">
        <ChordPlayer
          ref={notePlayerRef}
          rootNote="C"
          customIntervals={[0]}
        />
      </div>
    </div>
  )
}

export function ChordProgressionDiagramEditor({
  diagram,
  onChange,
  onRemove,
  className
}: ChordProgressionDiagramEditorProps) {
  const normalized = normalizeProgressionDiagram(diagram)
  const chordPlayerRef = useRef<{
    playChord: () => void
    stopChord: () => void
    playNote: (
      frequency: number,
      stringName?: string,
      stringIndex?: number,
      fretNumber?: number,
      octaveOffset?: number,
      noteVolumeOverride?: number
    ) => void
  } | null>(null)
  const templateOptions = scaleProgressions.map((scale) => scale.parentScale)
  const [templateScale, setTemplateScale] = useState(templateOptions[0] || 'Major')
  const [newChordRoot, setNewChordRoot] = useState(normalized.key)
  const [newChordType, setNewChordType] = useState(CHORD_TYPE_OPTIONS[0].value)
  const [previewVolume, setPreviewVolume] = useState(0.6)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null)
  const reference = scaleProgressions.find((scale) => scale.parentScale === templateScale)

  useEffect(() => {
    setNewChordRoot(normalized.key)
  }, [normalized.key])

  const updateDiagram = (next: Partial<ChordProgressionDiagram>) => {
    onChange({ ...normalized, ...next })
  }

  const handleChordChange = (chordId: string, next: Partial<ChordProgressionChord>) => {
    updateDiagram({
      chords: normalized.chords.map((chord) =>
        chord.id === chordId ? { ...chord, ...next } : chord
      )
    })
  }

  const handleAddChord = () => {
    const root = NOTE_OPTIONS.includes(newChordRoot) ? newChordRoot : normalized.key
    updateDiagram({
      chords: [
        ...normalized.chords,
        buildChordFromSelection(root, newChordType)
      ]
    })
  }

  const handleRemoveChord = (chordId: string) => {
    updateDiagram({
      chords: normalized.chords.filter((chord) => chord.id !== chordId)
    })
  }

  const playChordPreview = (chord: ChordProgressionChord) => {
    const source = chord.symbol || chord.name
    if (!source) return
    const root = parseChordRoot(source) || normalizeNoteName(normalized.key)
    if (!root) return
    const rootFreq = PREVIEW_NOTE_FREQUENCIES[root]
    if (!rootFreq || !chordPlayerRef.current) return
    const intervals = getChordIntervals(chord.symbol, chord.name)
    const volume = Math.min(Math.max(previewVolume, 0), 1)
    intervals.forEach((interval) => {
      chordPlayerRef.current?.playNote(
        rootFreq * Math.pow(2, interval / 12),
        undefined,
        undefined,
        undefined,
        undefined,
        volume
      )
    })
  }

  return (
    <div className={cn('space-y-3 rounded-md border bg-white/70 dark:bg-gray-900/50 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={normalized.name}
          onChange={(e) => updateDiagram({ name: e.target.value })}
          placeholder="Diagram name"
          className="h-8 max-w-[240px]"
        />
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Root</span>
          <Select
            value={normalized.key}
            onValueChange={(value) => updateDiagram({ key: value })}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_OPTIONS.map(note => (
                <SelectItem key={note} value={note}>
                  {note}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Volume</span>
          <Slider
            className="w-24"
            value={[previewVolume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(values) => setPreviewVolume(values[0])}
          />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2">
        {normalized.chords.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Add chords to show the progression.
          </div>
        ) : (
          <div className="flex items-stretch gap-2 overflow-x-auto">
            <div className="flex items-center text-sm font-semibold text-muted-foreground">
              {normalized.key}:
            </div>
            {normalized.chords.map((chord, index) => (
              <button
                key={chord.id}
                type="button"
                onClick={() => playChordPreview(chord)}
                className={cn(
                  'flex flex-col items-center justify-center px-3 text-left transition-colors hover:bg-muted/40',
                  index > 0 && 'border-l border-border'
                )}
              >
                <div className="text-base font-semibold">
                  {getIntervalFunctionLabel(normalized.key, chord.symbol, chord.name) || '...'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {chord.name || chord.symbol || 'Chord'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-medium">Template reference</span>
          <Select value={templateScale} onValueChange={setTemplateScale}>
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templateOptions.map((scale) => (
                <SelectItem key={scale} value={scale}>
                  {scale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {reference ? (
          <div className="flex flex-wrap gap-2">
            {reference.progression.map((chord, index) => {
              const referenceRoot = getReferenceChordRoot(
                normalized.key,
                reference.parentScale,
                chord.modeNumber,
                index
              )
              const typeValue = CHORD_TYPE_FROM_TEMPLATE[chord.type] || CHORD_TYPE_OPTIONS[0].value
              const referenceId = `${reference.parentScale}-${index}`
              return (
                <button
                  key={referenceId}
                  type="button"
                  onClick={() => {
                    setSelectedReferenceId(referenceId)
                    if (referenceRoot) {
                      setNewChordRoot(referenceRoot)
                    }
                    setNewChordType(typeValue)
                    if (referenceRoot) {
                      playChordPreview(buildChordFromSelection(referenceRoot, typeValue))
                    }
                  }}
                  className={cn(
                    'rounded border px-2 py-1 text-left transition-colors',
                    selectedReferenceId === referenceId
                      ? 'border-primary bg-primary/10'
                      : 'bg-background/70 hover:bg-background'
                  )}
                >
                  <div className="text-xs font-semibold">{chord.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {referenceRoot ? `${referenceRoot} ${chord.type}` : chord.type}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No template available.</div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">New chord</span>
          <Select value={newChordRoot} onValueChange={setNewChordRoot}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_OPTIONS.map(note => (
                <SelectItem key={note} value={note}>
                  {note}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newChordType} onValueChange={setNewChordType}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHORD_TYPE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[120px_1fr_auto] gap-2 text-xs text-muted-foreground">
          <div>Chord symbol</div>
          <div>Chord name</div>
          <div></div>
        </div>
        {normalized.chords.map((chord) => (
          <div key={chord.id} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
            <Input
              value={chord.symbol}
              onChange={(e) => handleChordChange(chord.id, { symbol: e.target.value })}
              placeholder="Cmaj7"
              className="h-8"
            />
            <Input
              value={chord.name}
              onChange={(e) => handleChordChange(chord.id, { name: e.target.value })}
              placeholder="C Major 7"
              className="h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveChord(chord.id)}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddChord}>
            Add chord
          </Button>
        </div>
      </div>
      <div className="hidden">
        <ChordPlayer
          ref={chordPlayerRef}
          rootNote="C"
          customIntervals={[0]}
        />
      </div>
    </div>
  )
}

export function MarkerDiagramList({ diagrams, onChange, className }: MarkerDiagramListProps) {
  const normalized = useMemo(() => normalizeMarkerDiagrams(diagrams), [diagrams])
  const [diagramType, setDiagramType] = useState<DiagramType>('neck')

  const handleAdd = () => {
    const next = diagramType === 'progression'
      ? createDefaultProgressionDiagram()
      : createDefaultNeckDiagram()
    onChange([...normalized, next])
  }

  const handleUpdate = (diagramId: string, nextDiagram: MarkerDiagram) => {
    onChange(
      normalized.map(diagram => (diagram.id === diagramId ? nextDiagram : diagram))
    )
  }

  const handleRemove = (diagramId: string) => {
    onChange(normalized.filter(diagram => diagram.id !== diagramId))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Diagrams</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={diagramType} onValueChange={(value) => setDiagramType(value as DiagramType)}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neck">Neck diagram</SelectItem>
              <SelectItem value="progression">Chord progression</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            Add diagram
          </Button>
        </div>
      </div>

      {normalized.length === 0 && (
        <div className="text-xs text-muted-foreground">No diagrams yet.</div>
      )}

      {normalized.map((diagram) => (
        diagram.type === 'progression' ? (
          <ChordProgressionDiagramEditor
            key={diagram.id}
            diagram={diagram}
            onChange={(next) => handleUpdate(diagram.id, next)}
            onRemove={() => handleRemove(diagram.id)}
          />
        ) : (
          <NeckDiagramEditor
            key={diagram.id}
            diagram={diagram}
            onChange={(next) => handleUpdate(diagram.id, next)}
            onRemove={() => handleRemove(diagram.id)}
          />
        )
      ))}
    </div>
  )
}
