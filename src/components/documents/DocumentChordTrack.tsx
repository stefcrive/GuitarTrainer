'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { SoundSelector } from '@/components/audio/SoundSelector'
import { chordPitches, validChord } from '@/lib/document-chords'
import type { DocumentScore, ScoreChord } from '@/types/document'
import type { Instrument } from '@/lib/instrument-audio'

const field = 'h-7 rounded border bg-background px-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
export function DocumentChordTrack({ score, onChange, position, playing, enabled, onEnabled, instrument, onInstrument }: { score: DocumentScore; onChange: (score: DocumentScore) => void; position: number; playing: boolean; enabled: boolean; onEnabled: (value: boolean) => void; instrument: Instrument; onInstrument: (value: Instrument) => void }) {
  const [expanded, setExpanded] = useState(false)
  const chords = [...(score.chords ?? [])].sort((a,b) => a.start - b.start)
  const update = (id: string, change: Partial<ScoreChord>) => onChange({ ...score, chords: chords.map(chord => chord.id === id ? { ...chord, ...change, origin: 'manual', confidence: 1, reason: 'Edited manually.' } : chord) })
  const active = chords.find(chord => position >= chord.start && position < chord.start + chord.duration)
  return <div className="shrink-0 space-y-1 rounded-md border px-2 py-1">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex h-8 items-center gap-1.5"><input type="checkbox" checked={enabled} onChange={event => onEnabled(event.target.checked)} />Chord track</label>
      <SoundSelector label="Sound" ariaLabel="Chord sound" value={instrument} onChange={onInstrument} />
      <span className="min-w-12 font-medium" aria-live="off">{active?.name ?? '-'}</span>
      {active?.origin === 'inferred' && <span className="text-muted-foreground">Inferred</span>}
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide chords' : `Edit chords (${chords.length})`}</Button>
      <MarkerHelp label="A separate accompaniment track. Symbol and Diagram come from the image; Inferred is a proposed harmonization. Edit names to generate a conventional voicing, or enter MIDI pitches for any chord. Start and duration count quarter-note beats within the selected measure. N.C. means silence." />
    </div>
    {expanded && <><Button variant="outline" size="sm" className="h-7 text-xs" disabled={!score.measures.length} onClick={() => {
      for (const [measure, bar] of score.measures.entries()) {
        let start = bar.start
        for (const chord of chords.filter(item => item.measure === measure).sort((a,b) => a.start-b.start)) {
          if (chord.start > start + 0.001) break
          start = Math.max(start, chord.start + chord.duration)
        }
        const end = Math.min(bar.end, ...chords.filter(item => item.measure === measure && item.start > start).map(item => item.start))
        if (end - start > 0.001) {
          onChange({ ...score, chords: [...chords, { id: crypto.randomUUID(), name: 'C', midi: [48,52,55], start, duration: end-start, measure, origin: 'manual', confidence: 1, reason: 'Added manually.' }] }); return
        }
      }
      // A fully covered progression can still gain a change by splitting the active chord.
      const target = active ?? chords[chords.length - 1]
      if (target) onChange({ ...score, chords: [...chords.map(chord => chord.id === target.id ? { ...chord, duration: chord.duration / 2 } : chord), { ...target, id: crypto.randomUUID(), start: target.start + target.duration / 2, duration: target.duration / 2, origin: 'manual', confidence: 1, reason: 'Added manually.' }] })
    }}><Plus className="mr-1 h-3 w-3" />Chord</Button>
      <div className="max-h-48 overflow-auto"><table className="w-full whitespace-nowrap text-xs"><thead className="sticky top-0 bg-muted"><tr>{['Measure','Chord','Start','Duration','MIDI voicing','Source',''].map((label,index) => <th className="px-1 py-1 text-left font-medium" key={index}>{label}</th>)}</tr></thead><tbody>
        {chords.map((chord,index) => <tr key={chord.id} className={`border-t ${!validChord(chord, score) ? 'bg-destructive/10' : playing && active?.id === chord.id ? 'bg-accent' : ''}`}>
          <td className="px-1 py-1"><select aria-label={`Chord ${index+1} measure`} className={`${field} w-24`} value={chord.measure} onChange={event => { const measure = Number(event.target.value); update(chord.id, { measure, start: score.measures[measure].start, duration: Math.min(chord.duration, score.measures[measure].end - score.measures[measure].start) }) }}>{score.measures.map((bar,i) => <option value={i} key={i}>{i+1} (bar {bar.label})</option>)}</select></td>
          <td className="px-1 py-1"><input aria-label={`Chord ${index+1} name`} className={`${field} w-24`} value={chord.name} onChange={event => update(chord.id, { name: event.target.value, midi: chordPitches(event.target.value) ?? [] })} /></td>
          <td className="px-1 py-1"><input aria-label={`Chord ${index+1} start beat in measure`} className={`${field} w-16`} type="number" min={0} step="any" value={chord.start-(score.measures[chord.measure]?.start ?? 0)} onChange={event => update(chord.id, { start: Number(event.target.value) + score.measures[chord.measure].start })} /></td>
          <td className="px-1 py-1"><input aria-label={`Chord ${index+1} duration`} className={`${field} w-16`} type="number" min={0.001} step="any" value={chord.duration} onChange={event => update(chord.id, { duration: Number(event.target.value) })} /></td>
          <td className="px-1 py-1"><ChordVoicing key={`${chord.id}-${chord.name}`} chord={chord} onChange={midi => update(chord.id, { midi })} /></td>
          <td className="px-1 py-1"><div className="flex items-center gap-1"><span>{({symbol:'Symbol',diagram:'Diagram',inferred:'Inferred',manual:'Manual'})[chord.origin]}</span><MarkerHelp label={`${Math.round(chord.confidence*100)}% confidence. ${chord.reason}`} /></div></td>
          <td className="px-1 py-1"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete chord ${index+1}`} onClick={() => onChange({ ...score, chords: chords.filter(item => item.id !== chord.id) })}><Trash2 className="h-3 w-3" /></Button></td>
        </tr>)}
      </tbody></table></div></>}
  </div>
}

function ChordVoicing({ chord, onChange }: { chord: ScoreChord; onChange: (midi: number[]) => void }) {
  const [text, setText] = useState(chord.midi.join(', '))
  return <input aria-label={`${chord.name} MIDI voicing`} className={`${field} w-36`} value={text} onChange={event => { const value = event.target.value; setText(value); onChange(value.trim() ? value.split(/[ ,]+/).filter(Boolean).map(Number) : []) }} />
}
