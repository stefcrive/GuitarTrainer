import type { DocumentScore, MeterSource, ScorePosition } from '@/types/document'
import { scoreLength } from '@/lib/document-score'

export interface Meter { beats: number; beatType: number }
export function resolveScoreMeter(score: DocumentScore, fallback: Meter, previous?: Meter): DocumentScore {
  let meter: Meter = { beats: score.beats ?? 0, beatType: score.beatType ?? 0 }
  let source: MeterSource = score.meterSource ?? 'recognized'
  if (!meter.beats || !meter.beatType) {
    const lengths = score.measures.filter(measure => !measure.implicit).map(measure => measure.end - measure.start)
    // An isolated bar or an irregular OMR draft cannot establish a meter.
    const length = lengths[0]
    const consistent = lengths.length >= 2 && lengths.every(value => Math.abs(value - length) < 0.02)
    const preferred = fallback.beats * 4 / fallback.beatType
    if (previous) { meter = previous; source = 'carried' }
    else if (consistent && Math.abs(length - preferred) < 0.02) { meter = fallback; source = 'inferred' }
    else if (consistent && [2, 3, 4].includes(length)) { meter = { beats: length, beatType: 4 }; source = 'inferred' }
    else { meter = fallback; source = 'assumed' }
  }
  const warnings = score.warnings.filter(warning => !warning.startsWith('No time signature') && !warning.startsWith('A time signature'))
  if (source !== 'recognized') warnings.push(`Meter ${meter.beats}/${meter.beatType} is ${source}; verify it against the source. Rhythmic values have not been rescaled.`)
  const measures = score.measures.map(measure => ({ ...measure, beats: measure.beats || meter.beats, beatType: measure.beatType || meter.beatType, meterSource: measure.beats ? measure.meterSource ?? 'recognized' : source }))
  if (measures.some(measure => !measure.implicit && Math.abs(measure.end - measure.start - measure.beats * 4 / measure.beatType) > 0.05)) warnings.push('Some measures do not match their meter. Check missing rests, beams, and tuplets in the note editor.')
  // Pad incomplete full bars with silence; do not stretch notes or truncate overflowing bars.
  let clock = 0
  const shifts = measures.map(measure => {
    const shift = clock - measure.start
    const length = Math.max(measure.end - measure.start, measure.implicit ? 0 : measure.beats * 4 / measure.beatType)
    measure.start = clock; measure.end = clock + length; clock = measure.end
    return shift
  })
  const notes = score.notes.map(note => ({ ...note, start: note.start + (note.measure === undefined ? 0 : shifts[note.measure] ?? 0) }))
  const chords = score.chords?.map(chord => ({ ...chord, start: chord.start + (shifts[chord.measure] ?? 0) }))
  return { ...score, ...meter, notes, chords, meterSource: source, measures, warnings: [...new Set(warnings)] }
}

export function combineDocumentScores(scores: DocumentScore[]): DocumentScore {
  if (!scores.length) throw new Error('No notation was recognized in the selected pages.')
  const result: DocumentScore = { ...scores[0], notes: [], chords: [], measures: [], sourcePages: [], warnings: [], musicXmlFiles: [], reviewed: false }
  let offset = 0
  scores.forEach((score, index) => {
    const measureOffset = result.measures.length
    result.chords!.push(...(score.chords ?? []).map(chord => ({ ...chord, id: `p${index}-${chord.id}`, start: chord.start + offset, measure: chord.measure + measureOffset })))
    result.notes.push(...score.notes.map(note => ({ ...note, id: `p${index}-${note.id}`, start: note.start + offset, measure: note.measure === undefined ? undefined : note.measure + measureOffset })))
    result.measures.push(...score.measures.map(measure => ({ ...measure, start: measure.start + offset, end: measure.end + offset })))
    result.sourcePages!.push(...(score.sourcePages ?? []))
    result.warnings.push(...score.warnings)
    result.musicXmlFiles!.push(...(score.musicXmlFiles ?? (score.musicXml ? [{ name: `notation-${index + 1}.musicxml`, xml: score.musicXml }] : [])))
    if (score.coverageWarning) result.coverageWarning = [result.coverageWarning, score.coverageWarning].filter(Boolean).join(' ')
    offset += scoreLength(score)
  })
  result.warnings = [...new Set(result.warnings)]
  result.sourcePages = result.sourcePages!.filter((page, index, pages) => pages.findIndex(other => other.page === page.page) === index)
  return result
}

export function metronomeBeats(score: DocumentScore, from: number, to: number): { beat: number; accent: boolean }[] {
  const result: { beat: number; accent: boolean }[] = []
  const measures = score.measures.length ? score.measures : [{ start: 0, end: to, beats: score.beats ?? 4, beatType: score.beatType ?? 4 }]
  for (const measure of measures) {
    const unit = 4 / (measure.beatType || score.beatType || 4)
    const bar = (measure.beats || score.beats || 4) * unit
    // Click the denominator beat; BPM remains quarter notes per minute.
    const first = Math.max(0, Math.ceil((from - measure.start - 1e-8) / unit))
    for (let index = first; index < 100_000; index++) {
      const beat = measure.start + index * unit
      if (beat >= Math.min(to, measure.end) - 1e-8) break
      result.push({ beat, accent: !('implicit' in measure && measure.implicit) && Math.abs((index * unit) % bar) < 1e-8 })
    }
  }
  return result
}

export function scorePlayhead(score: DocumentScore, beat: number): ScorePosition | undefined {
  const measureIndex = score.measures.findIndex(measure => beat >= measure.start && beat < measure.end)
  const events = score.notes.filter(note => note.position && (measureIndex < 0 ? note.start <= beat : note.measure === measureIndex)).sort((a, b) => a.start - b.start || a.position!.page - b.position!.page || a.position!.y - b.position!.y || a.position!.x - b.position!.x)
  const part = events[0]?.part
  const primary = events.filter(note => note.part === part)
  const latestStart = primary.findLast(note => note.start <= beat)?.start
  let active = primary.find(note => note.start === latestStart)
  active ??= primary[0]
  if (!active?.position) return score.measures[measureIndex]?.position
  // Keep the selected part/staff stable when a score has simultaneous voices.
  const sameStaff = events.filter(note => note.position?.system === active.position?.system && note.part === active.part)
  const current = sameStaff.findLast(note => note.start <= beat) ?? active
  const next = sameStaff.find(note => note.start > beat)
  const position = current.position!
  if (!next?.position || next.position.x <= position.x || next.start <= current.start) return position
  const fraction = Math.max(0, Math.min(1, (beat - current.start) / (next.start - current.start)))
  return { ...position, x: position.x + (next.position.x - position.x) * fraction }
}
