import type { DocumentScore, ScoreChord } from '@/types/document'

// Name edits use conventional close voicings; custom MIDI voicings remain editable.
export function chordPitches(name: string): number[] | null {
  const normalized = name.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj').replace(/−/g, 'm')
  if (/^(N\.?C\.?|rest)$/i.test(normalized)) return []
  const match = normalized.match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/)
  if (!match) return null
  const pc = (letter: string, accidental: string) => (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12
  const suffix = match[3].replace(/[()\s]/g, '')
  const qualities: Record<string, number[]> = {
    '': [0,4,7], maj: [0,4,7], M: [0,4,7], m: [0,3,7], min: [0,3,7], '5': [0,7],
    dim: [0,3,6], aug: [0,4,8], '+': [0,4,8], sus: [0,5,7], sus4: [0,5,7], sus2: [0,2,7],
    '6': [0,4,7,9], m6: [0,3,7,9], '7': [0,4,7,10], maj7: [0,4,7,11], M7: [0,4,7,11], m7: [0,3,7,10], min7: [0,3,7,10], mMaj7: [0,3,7,11],
    dim7: [0,3,6,9], m7b5: [0,3,6,10], 'ø7': [0,3,6,10], '7sus4': [0,5,7,10],
    '9': [0,4,7,10,14], maj9: [0,4,7,11,14], m9: [0,3,7,10,14], add9: [0,4,7,14], madd9: [0,3,7,14],
    '11': [0,4,7,10,14,17], m11: [0,3,7,10,14,17], '13': [0,4,7,10,14,21], maj13: [0,4,7,11,14,21], m13: [0,3,7,10,14,21],
    '7b9': [0,4,7,10,13], '7#9': [0,4,7,10,15], '7b5': [0,4,6,10], '7#5': [0,4,8,10],
  }
  const intervals = qualities[suffix]
  if (!intervals) return null
  const root = 48 + pc(match[1], match[2])
  const notes = intervals.map(interval => root + interval)
  return match[4] ? [36 + pc(match[4], match[5] ?? ''), ...notes] : notes
}

export function validChord(chord: ScoreChord, score: DocumentScore) {
  const measure = score.measures[chord.measure]
  return Boolean(measure && chord.name.trim() && chord.name.length <= 80 && Number.isFinite(chord.start) && Number.isFinite(chord.duration) && chord.duration > 0 && chord.start >= measure.start && chord.start + chord.duration <= measure.end + 1e-6 && (chord.midi.length || /^N\.?C\.?$/i.test(chord.name.trim())) && chord.midi.length <= 12 && chord.midi.every(pitch => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127))
}
export function validChordTrack(score: DocumentScore) {
  const chords = [...(score.chords ?? [])].sort((a,b) => a.start - b.start)
  return chords.every((chord, index) => validChord(chord, score) && (!index || chord.start >= chords[index - 1].start + chords[index - 1].duration - 1e-6))
}

const xmlEscape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
const pitchXml = (midi: number | null) => {
  if (midi === null) return '<rest/>'
  const steps = ['C','C','D','D','E','F','F','G','G','A','A','B']
  return `<pitch><step>${steps[midi % 12]}</step>${[1,3,6,8,10].includes(midi % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
}

// Export the current editable timeline, not a stale model response. Harmony has its own part.
export function exportScoreMusicXml(score: DocumentScore): string {
  const divisions = 9600
  const ticks = (beats: number) => Math.round(beats * divisions)
  const part = (chords: boolean) => score.measures.map((measure, index) => {
    const events = chords ? (score.chords ?? []).filter(chord => chord.measure === index).flatMap(chord => (chord.midi.length ? chord.midi : [null]).map(midi => ({ ...chord, midi }))) : score.notes.filter(note => note.start < measure.end && note.start + note.duration > measure.start)
    let cursor = 0
    const labels = chords ? (score.chords ?? []).filter(chord => chord.measure === index).map(chord => `<direction><direction-type><words>${xmlEscape(chord.name)}${chord.origin === 'inferred' ? ' (inferred)' : ''}</words></direction-type><offset>${ticks(chord.start - measure.start)}</offset></direction>`).join('') : ''
    const notes = events.sort((a,b) => a.start - b.start).map(event => {
      const start = ticks(Math.max(event.start, measure.start) - measure.start)
      const end = ticks(Math.min(event.start + event.duration, measure.end) - measure.start)
      const move = start < cursor ? `<backup><duration>${cursor - start}</duration></backup>` : start > cursor ? `<forward><duration>${start - cursor}</duration></forward>` : ''
      cursor = end
      const ratio = 'tuplet' in event && event.tuplet ? `<time-modification><actual-notes>${event.tuplet.actual}</actual-notes><normal-notes>${event.tuplet.normal}</normal-notes></time-modification>` : ''
      const ties = `${event.start < measure.start ? '<tie type="stop"/>' : ''}${event.start + event.duration > measure.end ? '<tie type="start"/>' : ''}`
      return `${move}<note>${pitchXml(event.midi)}<duration>${end-start}</duration>${ties}${ratio}</note>`
    }).join('')
    return `<measure number="${xmlEscape(measure.label)}" implicit="${measure.implicit ? 'yes' : 'no'}"><attributes><divisions>${divisions}</divisions><time><beats>${measure.beats || score.beats || 4}</beats><beat-type>${measure.beatType || score.beatType || 4}</beat-type></time></attributes>${index === 0 ? `<direction><sound tempo="${score.bpm}"/></direction>` : ''}${labels}${notes}${cursor < ticks(measure.end-measure.start) ? `<forward><duration>${ticks(measure.end-measure.start)-cursor}</duration></forward>` : ''}</measure>`
  }).join('')
  const harmony = Boolean(score.chords?.length)
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Notation</part-name></score-part>${harmony ? '<score-part id="GT_CHORDS"><part-name>Chord progression</part-name></score-part>' : ''}</part-list><part id="P1">${part(false)}</part>${harmony ? `<part id="GT_CHORDS">${part(true)}</part>` : ''}</score-partwise>`
}
