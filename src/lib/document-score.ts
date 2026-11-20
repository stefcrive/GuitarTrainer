import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { strFromU8, unzipSync } from 'fflate'
import type { DocumentScore, ScoreNote } from '@/types/document'
import type { ScoreLocator } from './document-omr-layout'

type XmlNode = Record<string, any>
const children = (node: XmlNode[], name: string): XmlNode[] => node.find(item => name in item)?.[name] ?? []
const value = (node: XmlNode[], name: string, fallback = ''): string => String(children(node, name)[0]?.['#text'] ?? fallback)
const number = (node: XmlNode[], name: string, fallback = 0): number => Number(value(node, name, String(fallback)))
const has = (node: XmlNode[], name: string) => node.some(item => name in item)

export function readMusicXml(bytes: Uint8Array): string {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return new TextDecoder().decode(bytes)
  const files = unzipSync(bytes, { filter: file => file.originalSize < 20_000_000 && /\.(xml|musicxml)$/.test(file.name) })
  const container = files['META-INF/container.xml']
  const path = container && strFromU8(container).match(/full-path=["']([^"']+)["']/)?.[1]
  const target = path && files[path] ? files[path] : Object.entries(files).find(([name]) => !name.startsWith('META-INF/'))?.[1]
  if (!target) throw new Error('No MusicXML score was found in this archive.')
  return strFromU8(target)
}

export function parseMusicXml(xml: string, source: DocumentScore['source'] = 'musicxml', locate?: ScoreLocator): DocumentScore {
  if (xml.length > 20_000_000 || /<!ENTITY\b/i.test(xml)) throw new Error('Invalid or oversized MusicXML.')
  if (XMLValidator.validate(xml) !== true) throw new Error('The MusicXML file is not valid XML.')
  const tree: XmlNode[] = new XMLParser({ preserveOrder: true, ignoreAttributes: false, processEntities: false }).parse(xml)
  const root = children(tree, 'score-partwise')
  if (!root.length) throw new Error('Use a score-partwise MusicXML file (.musicxml or .mxl).')
  const score: DocumentScore = { notes: [], measures: [], beats: null, beatType: null, bpm: 80, reviewed: false, source, warnings: [] }
  const warnings = new Set<string>()
  const parts = root.filter(node => 'part' in node)
  const measureLengths: number[] = []
  const partStarts = new Map<string, number[]>()
  const chordLabels: { measure: number; start: number; name: string }[] = []
  let primaryPart = true
  for (const [partIndex, part] of parts.entries()) {
    // A notation+TAB export can contain the same performance twice.
    const tabStaves = new Set<number>()
    for (const measure of part.part as XmlNode[]) for (const element of (measure.measure ?? []) as XmlNode[]) {
      for (const clef of ((element.attributes ?? []) as XmlNode[]).filter(node => 'clef' in node)) {
        if (value(clef.clef, 'sign') === 'TAB') tabStaves.add(Number(clef[':@']?.['@_number'] ?? 1))
      }
    }
    if (tabStaves.size && (part.part as XmlNode[]).every(measure => ((measure.measure ?? []) as XmlNode[]).filter(element => element.note).every(element => tabStaves.has(number(element.note, 'staff', 1))))) continue
    let divisions = 1, beats = 0, beatType = 0, clock = 0, transpose = 0
    const partId = String(part[':@']?.['@_id'] ?? partIndex)
    const ties = new Map<string, ScoreNote>()
    const starts: number[] = []; partStarts.set(partId, starts)
    let hasNotation = false
    for (const [measureIndex, measure] of (part.part as XmlNode[]).filter(node => 'measure' in node).entries()) {
      starts.push(clock)
      let cursor = 0, extent = 0, lastStart = 0
      const label = String(measure[':@']?.['@_number'] ?? score.measures.length + 1)
      for (const element of measure.measure as XmlNode[]) {
        if (element.attributes) {
          const attr = element.attributes as XmlNode[]
          divisions = number(attr, 'divisions', divisions)
          if (!Number.isFinite(divisions) || divisions <= 0) throw new Error('MusicXML has invalid rhythmic divisions.')
          const time = children(attr, 'time')
          if (time.length) {
            const beatText = value(time, 'beats')
            beats = beatText.split('+').reduce((sum, term) => sum + Number(term), 0)
            beatType = number(time, 'beat-type')
            if (!(beats > 0 && beatType > 0)) { beats = 0; beatType = 0; warnings.add('A time signature could not be read. Set the meter before playback.') }
            if (score.beats === null && beats) { score.beats = beats; score.beatType = beatType; score.meterSource = 'recognized' }
          }
          const trans = children(attr, 'transpose')
          if (trans.length) transpose = number(trans, 'chromatic') + number(trans, 'octave-change') * 12
        }
        if (element.backup) cursor = Math.max(0, cursor - number(element.backup, 'duration') / divisions)
        if (element.forward) { cursor += number(element.forward, 'duration') / divisions; extent = Math.max(extent, cursor) }
        if (element.direction) {
          if (partId === 'GT_CHORDS') {
            const name = value(children(element.direction, 'direction-type'), 'words')
            if (name) chordLabels.push({ measure: measureIndex, start: number(element.direction, 'offset') / divisions, name })
          }
          const sound = (element.direction as XmlNode[]).find(node => 'sound' in node)
          const tempo = Number(sound?.[':@']?.['@_tempo'])
          if (tempo > 0) score.bpm = Math.min(300, Math.max(20, tempo))
          if (sound?.[':@']?.['@_dacapo'] || sound?.[':@']?.['@_dalsegno']) warnings.add('Playback follows written order; jumps and repeats are not expanded.')
        }
        if (element.barline && (has(element.barline, 'repeat') || has(element.barline, 'ending'))) warnings.add('Playback follows written order; jumps and repeats are not expanded.')
        if (!element.note) continue
        const note = element.note as XmlNode[]
        if (has(note, 'grace')) { warnings.add('Grace notes need manual timing and are omitted from playback.'); continue }
        const modification = children(note, 'time-modification')
        const actual = number(modification, 'actual-notes'), normal = number(modification, 'normal-notes')
        const tuplet = actual > 0 && normal > 0 ? { actual, normal } : undefined
        const written = ({ whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 } as Record<string, number>)[value(note, 'type')]
        const dots = note.filter(element => 'dot' in element).length
        // MusicXML duration already incorporates tuplets. Only derive timing when absent;
        // applying the ratio twice makes sextuplets run too fast.
        const duration = has(note, 'duration') ? number(note, 'duration') / divisions : written * (2 - 2 ** -dots) * (tuplet ? normal / actual : 1)
        if (!(duration > 0 && Number.isFinite(duration))) { warnings.add('A note has no usable duration and was omitted.'); continue }
        const chord = has(note, 'chord')
        const start = clock + (chord ? lastStart : cursor)
        if (!chord) { lastStart = cursor; cursor += duration }
        extent = Math.max(extent, start - clock + duration, cursor)
        const staff = number(note, 'staff', 1)
        if (tabStaves.has(staff)) continue
        hasNotation = true
        const pitch = children(note, 'pitch')
        let midi: number | null = null
        if (pitch.length) {
          const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[value(pitch, 'step')]
          if (semitone === undefined) { warnings.add('An unreadable pitch was omitted.'); continue }
          midi = (number(pitch, 'octave') + 1) * 12 + semitone + number(pitch, 'alter') + transpose
          if (midi < 0 || midi > 127) { warnings.add('An out-of-range pitch was omitted.'); continue }
        } else if (!has(note, 'rest')) { warnings.add('Unpitched notes are not played.'); continue }
        const technical = children(children(note, 'notations'), 'technical')
        const event: ScoreNote = { id: `n${score.notes.length}`, start, duration, midi, part: partId, measure: measureIndex, tuplet,
          position: locate?.(partId, label, staff, Number(element[':@']?.['@_default-x']), measureIndex),
          ...(has(technical, 'string') ? { string: number(technical, 'string'), fret: number(technical, 'fret') } : {}) }
        const tieTypes = note.filter(node => 'tie' in node).map(node => node[':@']?.['@_type'])
        const tieKey = `${value(note, 'voice', '1')}:${value(note, 'staff', '1')}:${midi}`
        const tied = ties.get(tieKey)
        if (tieTypes.includes('stop') && tied && Math.abs(tied.start + tied.duration - start) < 0.001) tied.duration += duration
        else score.notes.push(event)
        if (tieTypes.includes('start')) ties.set(tieKey, tied && tieTypes.includes('stop') ? tied : event)
        else if (tieTypes.includes('stop')) ties.delete(tieKey)
      }
      const implicit = measure[':@']?.['@_implicit'] === 'yes'
      const length = implicit ? extent : Math.max(extent, beats && beatType ? beats * 4 / beatType : extent)
      measureLengths[measureIndex] = Math.max(measureLengths[measureIndex] ?? 0, length)
      if (primaryPart || !score.measures[measureIndex]) score.measures[measureIndex] = { label, start: clock, end: clock + length, beats, beatType, implicit, meterSource: beats ? 'recognized' : undefined,
        position: locate?.(partId, label, 1, 0, measureIndex) }
      clock += length
    }
    if (hasNotation) primaryPart = false
  }
  // Align simultaneous parts to shared bar boundaries, even when OMR omitted a rest.
  let measureStart = 0
  for (const [index, measure] of score.measures.entries()) {
    measure.start = measureStart; measure.end = measureStart + (measureLengths[index] ?? 0)
    measureStart = measure.end
  }
  for (const note of score.notes) if (note.measure !== undefined && note.part) {
    note.start += (score.measures[note.measure]?.start ?? 0) - (partStarts.get(note.part)?.[note.measure] ?? 0)
  }
  score.notes.sort((a, b) => a.start - b.start)
  if (chordLabels.length) {
    const accompaniment = score.notes.filter(note => note.part === 'GT_CHORDS')
    score.chords = chordLabels.map((label, index) => {
      const measure = score.measures[label.measure], start = measure.start + label.start
      const notes = accompaniment.filter(note => note.measure === label.measure && Math.abs(note.start - start) < 1e-6)
      const next = chordLabels.find(other => other.measure === label.measure && other.start > label.start)
      const inferred = label.name.endsWith(' (inferred)')
      return { id: `import-chord-${index}`, name: label.name.replace(/ \(inferred\)$/, ''), measure: label.measure, start, duration: notes[0]?.duration ?? (next ? next.start - label.start : measure.end - start), midi: notes.flatMap(note => note.midi === null ? [] : [note.midi]), origin: inferred ? 'inferred' : 'manual', confidence: inferred ? 0.5 : 1, reason: 'Imported from the chord progression part.' }
    })
    score.notes = score.notes.filter(note => note.part !== 'GT_CHORDS')
  }
  if (!score.notes.some(note => note.midi !== null)) throw new Error('No pitched notes were recognized. Try a larger, clearer selection including the clef and time signature.')
  if (score.beats === null) warnings.add('No time signature was recognized. Set the meter before playback.')
  warnings.add('Check pitches, guitar octave, accidentals, tuplets, and durations against the source before confirming.')
  score.warnings = [...warnings]
  return score
}

export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40] // high E to low E
export const midiLabel = (midi: number | null) => midi === null ? 'Rest' : `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][Math.round(midi) % 12]}${Math.floor(midi / 12) - 1}`
export const scoreLength = (score: DocumentScore) => Math.max(score.notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0), score.measures.reduce((max, measure) => Math.max(max, measure.end), 0))

export function emptyScore(source: DocumentScore['source'] = 'manual'): DocumentScore {
  return { notes: [], measures: [], beats: null, beatType: null, bpm: 80, reviewed: false, source, warnings: [] }
}

export function parseTextTab(text: string): DocumentScore {
  const score = emptyScore('tab-ocr')
  const lines = text.split(/\r?\n/).filter(line => /^\s*[eEBGDA]?\s*[|:]?[-|\d\s]{8,}/.test(line))
  if (lines.length < 6) throw new Error('Select six complete TAB strings, or add notes manually.')
  let offset = 0
  for (let row = 0; row + 5 < lines.length; row += 6) {
    const events: { column: number; string: number; fret: number }[] = []
    lines.slice(row, row + 6).forEach((line, string) => {
      for (const match of line.matchAll(/\d{1,2}/g)) if (Number(match[0]) <= 24) events.push({ column: match.index!, string: string + 1, fret: Number(match[0]) })
    })
    const columns = [...new Set(events.map(event => event.column))].sort((a, b) => a - b)
    for (const event of events) score.notes.push({ id: `n${score.notes.length}`, start: offset + columns.indexOf(event.column), duration: 1, midi: STANDARD_TUNING[event.string - 1] + event.fret, string: event.string, fret: event.fret })
    offset += columns.length
  }
  if (!score.notes.length) throw new Error('No TAB fret numbers were found.')
  score.warnings = ['TAB rhythm and meter are unknown. Quarter-note spacing is a draft; set every duration and the time signature before confirming.', 'Standard EADGBE tuning is assumed; verify strings and pitches.']
  return score
}
