'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Play, Square, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { DocumentDialog } from './DocumentDialog'
import { useDocumentPlayback } from '@/hooks/useDocumentPlayback'
import { midiLabel, parseMusicXml, readMusicXml, scoreLength, STANDARD_TUNING } from '@/lib/document-score'
import type { DocumentScore, ScoreNote } from '@/types/document'
import type { DocumentReader } from '@/services/document-reader'
import { DocumentScoreSource } from './DocumentScoreSource'
import { resolveScoreMeter } from '@/lib/document-score-timing'
import { DocumentChordTrack } from './DocumentChordTrack'
import { SoundSelector } from '@/components/audio/SoundSelector'
import { useSoundStore } from '@/stores/sound-store'
import { validChordTrack, exportScoreMusicXml } from '@/lib/document-chords'

const fieldClass = 'h-8 w-full rounded-md border bg-background px-1 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function DocumentScorePlayer({ initial, title, preview, reader, unsaved = false, onReadAgain, onSave, onClose }: { initial: DocumentScore; title: string; preview?: string; reader?: DocumentReader; unsaved?: boolean; onReadAgain?: () => void; onSave: (score: DocumentScore) => void | Promise<void>; onClose: () => void }) {
  const notesId = useId()
  const defaults = useSoundStore()
  const [instrument, setInstrument] = useState(initial.playback?.instrument ?? defaults.notation)
  const [chordInstrument, setChordInstrument] = useState(initial.playback?.chordInstrument ?? defaults.chords)
  const [melodyEnabled, setMelodyEnabled] = useState(initial.playback?.melodyEnabled ?? true)
  const [chordsEnabled, setChordsEnabled] = useState(initial.playback?.chordsEnabled ?? true)
  const [score, setScore] = useState(initial)
  const [bpm, setBpm] = useState(initial.bpm)
  const [firstMeasure, setFirstMeasure] = useState(initial.playback?.firstMeasure ?? 0)
  const [lastMeasure, setLastMeasure] = useState(initial.playback?.lastMeasure ?? -1)
  const [loop, setLoop] = useState(initial.playback?.loop ?? true)
  const [octave, setOctave] = useState(initial.playback?.octave ?? 0)
  const [click, setClick] = useState(initial.playback?.click ?? true)
  const [autoscroll, setAutoscroll] = useState(initial.playback?.autoscroll ?? true)
  const [editNotes, setEditNotes] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)
  const snapshot = JSON.stringify({ score, bpm, firstMeasure, lastMeasure, loop, octave, click, autoscroll, instrument, chordInstrument, melodyEnabled, chordsEnabled })
  const original = useRef(snapshot)
  const dirty = unsaved || snapshot !== original.current
  const requestLeave = (action: () => void) => {
    if (saving) return
    if (dirty) { playback.stop(); setDiscardAction(() => action) }
    else action()
  }
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const total = useMemo(() => scoreLength(score), [score])
  const measures = score.measures.length ? score.measures : [{ label: '1', start: 0, end: total, beats: score.beats ?? 4, beatType: score.beatType ?? 4 }]
  const first = Math.min(firstMeasure, measures.length - 1)
  const last = lastMeasure < 0 ? measures.length - 1 : Math.max(first, Math.min(lastMeasure, measures.length - 1))
  const from = measures[first]?.start ?? 0
  const to = last === measures.length - 1 ? total : measures[last].end
  const playback = useDocumentPlayback(score, bpm, from, to, loop, octave, click, instrument, chordInstrument, melodyEnabled, chordsEnabled)
  const validNotes = score.notes.length > 0 && score.notes.every(note => Number.isFinite(note.start) && note.start >= 0 && Number.isFinite(note.duration) && note.duration > 0 && (note.midi === null || (Number.isFinite(note.midi) && note.midi >= 0 && note.midi <= 127)))
  const validChords = validChordTrack(score)
  const validMeter = Boolean(score.beats && score.beats > 0 && score.beats <= 32 && Number.isInteger(score.beats) && [1, 2, 4, 8, 16, 32].includes(score.beatType ?? 0))
  const rangeValid = Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to - from >= 0.05 && to <= total + 0.0001
  const editNote = (id: string, change: Partial<ScoreNote>) => setScore(current => ({ ...current, reviewed: false, notes: current.notes.map(note => note.id === id ? { ...note, ...change } : note) }))
  function editMeter(beats: number | null, beatType: number | null) {
    const next = { ...score, beats, beatType, meterSource: 'manual' as const, reviewed: false,
      measures: score.measures.map(measure => !measure.beats || measure.beats === score.beats && measure.beatType === score.beatType ? { ...measure, beats: beats ?? 0, beatType: beatType ?? 0, meterSource: 'manual' as const } : measure),
      warnings: score.warnings.filter(warning => !warning.startsWith('Meter ')) }
    setScore(beats && beatType ? resolveScoreMeter(next, { beats, beatType }) : next)
  }
  const hasSource = Boolean(preview || score.sourcePages?.length)
  const coverageWarning = score.coverageWarning
    ? Array.from(new Set(score.coverageWarning.split(/(?<=[.!?])\s+/))).join(' ')
    : ''
  return <DocumentDialog title={title} onClose={() => requestLeave(onClose)} wide
    className={`max-w-6xl max-h-[94dvh] overflow-hidden open:flex open:flex-col ${hasSource ? 'h-[94dvh]' : ''}`}
    contentClassName="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
    footer={<div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <div className="order-1 flex items-center gap-2">
        <Button size="sm" disabled={!playback.playing && (!validNotes || !validChords || !validMeter || !rangeValid || bpm < 20 || bpm > 300)} onClick={() => playback.playing || playback.loading ? playback.stop() : void playback.play()}>{playback.playing ? <Square className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}{playback.loading ? 'Cancel loading' : playback.playing ? 'Stop' : 'Play'}</Button>
        <span className="text-xs tabular-nums">Beat {playback.position.toFixed(2)}</span>
      </div>
      <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:w-auto">
        <label className="flex h-8 items-center gap-1.5"><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} />Loop</label>
        <label className="flex items-center gap-1.5">From<select aria-label="Loop from measure" className={`${fieldClass} !w-24 sm:!w-28`} value={first} onChange={event => { const index = Number(event.target.value); setFirstMeasure(index); if (last < index) setLastMeasure(index) }}>{measures.map((measure, index) => <option key={index} value={index}>{index + 1} (bar {measure.label})</option>)}</select></label>
        <label className="flex items-center gap-1.5">To<select aria-label="Loop to measure" className={`${fieldClass} !w-24 sm:!w-28`} value={last} onChange={event => setLastMeasure(Number(event.target.value))}>{measures.map((measure, index) => <option key={index} value={index} disabled={index < first}>{index + 1} (bar {measure.label})</option>)}</select></label>
      </div>
      <Button className="order-2 ml-auto sm:order-3" size="sm" onClick={async () => { if (saving) return; playback.stop(); setSaving(true); setError(''); try { await onSave({ ...score, bpm, musicXml: score.measures.length ? exportScoreMusicXml({ ...score, bpm }) : score.musicXml, musicXmlFiles: undefined, playback: { from, to, loop, octave, click, autoscroll, firstMeasure: first, lastMeasure: last, instrument, chordInstrument, melodyEnabled, chordsEnabled } }); original.current = snapshot } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save score.') } finally { setSaving(false) } }} disabled={saving || !validNotes || !validChords || !rangeValid || bpm < 20 || bpm > 300}>{saving ? 'Saving...' : 'Save score'}</Button>
    </div>}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2 text-xs">
        <label className="flex h-8 items-center gap-1.5"><input type="checkbox" checked={melodyEnabled} onChange={event => setMelodyEnabled(event.target.checked)} />Notation</label>
        <SoundSelector label="Sound" ariaLabel="Notation sound" value={instrument} onChange={setInstrument} />
        <label className="flex items-center gap-2">BPM<Input className="h-8 w-16 px-2 text-xs md:text-xs" type="number" min={20} max={300} value={bpm} onChange={event => setBpm(Number(event.target.value))} /></label>
        <div className="flex items-center gap-2" role="group" aria-label="Time signature">
          <span>Meter</span>
          <div className="flex items-center gap-1">
            <input aria-label="Beats per measure" type="number" min={1} max={32} className={`${fieldClass} !w-12`} value={score.beats ?? ''} onChange={event => editMeter(Number(event.target.value) || null, score.beatType)} /><span>/</span>
            <select aria-label="Beat unit" className={`${fieldClass} !w-14`} value={score.beatType ?? ''} onChange={event => editMeter(score.beats, Number(event.target.value) || null)}><option value="">?</option>{[1, 2, 4, 8, 16, 32].map(value => <option key={value}>{value}</option>)}</select>
          </div>
          <MarkerHelp align="end" label={`${score.meterSource ? `${score.meterSource} meter. ` : ''}BPM and timing count quarter notes: 0.5 is an eighth note; 1/3 is an eighth-note triplet. Meter edits do not rewrite durations. MusicXML meter changes are preserved in the measure list.`} />
        </div>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-2">Octave<select className={`${fieldClass} !w-16`} value={octave} onChange={event => setOctave(Number(event.target.value))}>{[-2, -1, 0, 1].map(value => <option key={value} value={value}>{value > 0 ? '+' : ''}{value}</option>)}</select></label>
          <MarkerHelp label="Octave shifts affect playback only; the original notation stays unchanged." />
        </div>
        <div className="flex items-center gap-1">
          <label className="flex h-8 items-center gap-1.5"><input type="checkbox" checked={click} onChange={event => setClick(event.target.checked)} />Tempo click</label>
          <MarkerHelp align="end" label="Clicks follow the meter's beat unit, with an accent on the first beat of each full measure. BPM always counts quarter notes; 6/8 at 80 BPM clicks eighths at 160 per minute. Toggle while playing." />
        </div>
      </div>
      <DocumentScoreSource score={score} reader={reader} preview={preview} position={playback.position} playing={playback.playing} autoscroll={autoscroll}
        toolbarActions={<label className="flex h-7 items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={autoscroll} onChange={event => setAutoscroll(event.target.checked)} />Auto-scroll</label>} />
      <DocumentChordTrack score={score} onChange={setScore} position={playback.position} playing={playback.playing} enabled={chordsEnabled} onEnabled={setChordsEnabled} instrument={chordInstrument} onInstrument={setChordInstrument} />
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" aria-expanded={editNotes} aria-controls={editNotes ? notesId : undefined} onClick={() => setEditNotes(!editNotes)}>{editNotes ? 'Hide notes' : `Edit notes (${score.notes.length})`}</Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><span>Recognition notes</span><MarkerHelp side="top" align="end" label={score.warnings.join(' ') || 'No recognition warnings.'} /></div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {onReadAgain && <Button size="sm" className="h-8 px-2 text-xs" variant="ghost" onClick={() => requestLeave(() => { playback.stop(); onReadAgain() })}>Read again</Button>}
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs hover:bg-accent focus-within:ring-2 focus-within:ring-ring"><Upload className="h-3 w-3" />Import MusicXML<input aria-label="Import MusicXML" type="file" accept=".xml,.musicxml,.mxl" className="sr-only" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return
          try { const next = parseMusicXml(readMusicXml(new Uint8Array(await file.arrayBuffer()))); setScore(next); setBpm(next.bpm); setFirstMeasure(0); setLastMeasure(-1); setError('') } catch (error) { setError(error instanceof Error ? error.message : 'Import failed.') }
          event.target.value = ''
        }} /></label>
          {Boolean(score.measures.length) && <Button size="sm" className="h-8 px-2 text-xs" variant="outline" disabled={!validChords || !validNotes} onClick={() => {
        const blob = new Blob([exportScoreMusicXml({ ...score, bpm })], { type: 'application/vnd.recordare.musicxml+xml' })
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'notation.musicxml'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Export MusicXML</Button>}
        </div>
      </div>
      {(coverageWarning || score.source === 'tab-ocr' && !score.reviewed || !validNotes || !validChords || !validMeter || error || playback.error) && <div className="max-h-24 shrink-0 space-y-1 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
        {coverageWarning && <div role="status">{coverageWarning}</div>}
        {score.source === 'tab-ocr' && !score.reviewed && <div role="status">TAB timing is unknown. Correct the draft durations and set the meter.</div>}
        {!validChords && <div role="alert">Check chord voicings and timing: use MIDI pitches 0-127, positive durations, and non-overlapping events within each measure.</div>}
        {(!validNotes || !validMeter) && <div role="status">Enter valid notes and a time signature to enable playback.</div>}
        {(error || playback.error) && <div role="alert">{error || playback.error}</div>}
      </div>}
      {editNotes && <div id={notesId} className="shrink-0 space-y-1">
        <Button variant="outline" size="sm" onClick={() => { setEditNotes(true); setScore({ ...score, reviewed: false, notes: [...score.notes, { id: crypto.randomUUID(), start: total, duration: 1, midi: 64 }] }); setLastMeasure(-1) }}><Plus className="mr-1 h-3 w-3" />Note</Button>
      <div className="max-h-[25dvh] overflow-auto rounded-md border">
        <table className="w-full whitespace-nowrap text-xs"><thead className="sticky top-0 bg-muted"><tr>{['#', 'Pitch / MIDI', 'Start beat', 'Duration', 'String', 'Fret', ''].map((label, index) => <th key={index} className="px-2 py-1 text-left font-medium">{label}</th>)}</tr></thead>
          <tbody>{score.notes.map((note, index) => <tr key={note.id} className={`border-t ${playback.playing && playback.position >= note.start && playback.position < note.start + note.duration ? 'bg-accent' : ''}`}>
            <td className="px-2 py-1 tabular-nums">{index + 1}</td>
            <td className="px-2 py-1"><div className="flex items-center gap-2"><span className="w-9">{midiLabel(note.midi)}</span><input aria-label={`Note ${index + 1} MIDI pitch; blank for rest`} type="number" min={0} max={127} value={note.midi ?? ''} className={`${fieldClass} !w-16`} onChange={event => editNote(note.id, { midi: event.target.value === '' ? null : Number(event.target.value) })} /></div></td>
            <td className="px-2 py-1"><input aria-label={`Note ${index + 1} start`} type="number" min={0} step="any" className={fieldClass} value={note.start} onChange={event => editNote(note.id, { start: Number(event.target.value) })} /></td>
            <td className="px-2 py-1"><input aria-label={`Note ${index + 1} duration`} type="number" min={0.001} step="any" className={fieldClass} value={note.duration} onChange={event => editNote(note.id, { duration: Number(event.target.value) })} /></td>
            <td className="px-2 py-1"><input aria-label={`Note ${index + 1} string`} type="number" min={1} max={6} className={`${fieldClass} min-w-12`} value={note.string ?? ''} onChange={event => { const string = Number(event.target.value); editNote(note.id, { string: string || undefined, ...(string >= 1 && string <= 6 && note.fret !== undefined ? { midi: STANDARD_TUNING[string - 1] + note.fret } : {}) }) }} /></td>
            <td className="px-2 py-1"><input aria-label={`Note ${index + 1} fret`} type="number" min={0} max={24} className={`${fieldClass} min-w-12`} value={note.fret ?? ''} onChange={event => { const fret = Number(event.target.value); editNote(note.id, { fret, ...(note.string ? { midi: STANDARD_TUNING[note.string - 1] + fret } : {}) }) }} /></td>
            <td className="px-1"><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete note ${index + 1}`} onClick={() => setScore({ ...score, reviewed: false, notes: score.notes.filter(item => item.id !== note.id) })}><Trash2 className="h-3 w-3" /></Button></td>
          </tr>)}</tbody></table>
      </div></div>}
    {discardAction && <DocumentDialog title="Discard unsaved notation?" onClose={() => setDiscardAction(null)}>
      <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setDiscardAction(null)}>Keep editing</Button><Button size="sm" variant="destructive" onClick={() => { playback.stop(); discardAction(); setDiscardAction(null) }}>Discard changes</Button></div>
    </DocumentDialog>}
  </DocumentDialog>
}
