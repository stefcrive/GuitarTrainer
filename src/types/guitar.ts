export interface Note {
  name: string
  intervalName?: string
  isHighlighted?: boolean
}

export interface FretPosition {
  string: number // 1-6, where 1 is the highest string (F) and 6 is the lowest (E)
  fret: number // 0-24
  note: Note
}

export type DiagramLabelMode = 'notes' | 'intervals'
export type DiagramType = 'neck' | 'progression'

export interface DiagramPosition {
  stringIndex: number // 0-5, where 0 is the highest string
  fret: number // 0-24
}

export interface NeckDiagram {
  id: string
  type: 'neck'
  name: string
  startFret: number
  endFret: number
  rootNote: string
  labelMode: DiagramLabelMode
  positions: DiagramPosition[]
  fingerNumbers: string[] // length matches STANDARD_TUNING
}

export interface ChordProgressionChord {
  id: string
  symbol: string
  name: string
}

export interface ChordProgressionDiagram {
  id: string
  type: 'progression'
  name: string
  key: string
  chords: ChordProgressionChord[]
}

export type MarkerDiagram = NeckDiagram | ChordProgressionDiagram

export interface Scale {
  name: string
  intervals: number[] // Semitones from root
  category: 'scale'
  parentScale?: string
}

export interface Chord {
  name: string
  intervals: number[] // Semitones from root
  category: 'chord'
  parentGroup?: string
}

export type ChordOrScale = Scale | Chord

// All-fourths tuning from high (1st string) to low (6th string)
// F -> C -> G -> D -> A -> E
export const STANDARD_TUNING = ['F3', 'C3', 'G2', 'D2', 'A1', 'E1'] // From 1st string (highest) to 6th string (lowest)

// Total number of frets to display
export const TOTAL_FRETS = 16
