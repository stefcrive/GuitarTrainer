const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function getNoteAtFret(tuning: string, fret: number): string {
  // Extract the base note from the tuning (e.g., 'E4' -> 'E')
  const baseNote = tuning.replace(/\d/g, '')
  
  // Find the starting index in the NOTES array
  const startIndex = NOTES.indexOf(baseNote)
  if (startIndex === -1) return ''

  // Calculate the note at the given fret
  const noteIndex = (startIndex + fret) % NOTES.length
  return NOTES[noteIndex]
}

export function calculateIntervalNotes(rootNote: string, intervals: number[]): string[] {
  const rootIndex = NOTES.indexOf(rootNote)
  if (rootIndex === -1) return []

  return intervals.map(interval => {
    const noteIndex = (rootIndex + interval) % NOTES.length
    return NOTES[noteIndex]
  })
}

export function isNoteInIntervals(note: string, rootNote: string, intervals: number[]): boolean {
  const intervalNotes = calculateIntervalNotes(rootNote, intervals)
  return intervalNotes.includes(note)
}

export function getIntervalName(note: string, rootNote: string, intervals: number[]): string {
  const hasExtendedIntervals = intervals.some(interval => interval > 11)
  const basicIntervalNames = new Map([
    [0, "Root"],
    [1, "♭2"],
    [2, "2"],
    [3, "♭3"],
    [4, "3"],
    [5, "4"],
    [6, "♭5"],
    [7, "5"],
    [8, "♭6"],
    [9, "6"],
    [10, "♭7"],
    [11, "7"]
  ])

  const rootIndex = NOTES.indexOf(rootNote)
  const noteIndex = NOTES.indexOf(note)
  if (rootIndex === -1 || noteIndex === -1) return ''

  let interval = (noteIndex - rootIndex + 12) % 12
  
  // If the interval isn't used at all, return empty
  if (!intervals.includes(interval) &&
      !intervals.includes(interval + 12) && // 9th
      !intervals.includes(interval + 12 + 5) && // 11th
      !intervals.includes(interval + 12 + 9)) // 13th
    return ''

  // For extended chords, show compound names for 2/9, 4/11, 6/13
  if (hasExtendedIntervals) {
    if (interval === 2 && intervals.includes(14)) return "2/9"
    if (interval === 5 && intervals.includes(17)) return "4/11"
    if (interval === 9 && intervals.includes(21)) return "6/13"
  }

  return basicIntervalNames.get(interval) || ''
}