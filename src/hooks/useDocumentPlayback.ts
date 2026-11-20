'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentScore } from '@/types/document'
import { usePlaybackStore } from '@/stores/playback-store'
import { useWorkspaceActive } from '@/hooks/useWorkspaceNavigation'
import { metronomeBeats } from '@/lib/document-score-timing'
import { prepareInstrument, type Instrument } from '@/lib/instrument-audio'

export function useDocumentPlayback(score: DocumentScore, bpm: number, from: number, to: number, loop: boolean, octave: number, click = false, instrument: Instrument = 'acoustic_guitar_nylon', chordInstrument: Instrument = 'acoustic_grand_piano', melodyEnabled = true, chordsEnabled = true) {
  const workspaceActive = useWorkspaceActive()
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(from)
  const [error, setError] = useState('')
  const context = useRef<AudioContext | null>(null)
  const clickEnabled = useRef(click)
  const clickGain = useRef<GainNode | null>(null)
  useEffect(() => { clickEnabled.current = click; if (clickGain.current) clickGain.current.gain.value = click ? 1 : 0 }, [click])
  const stop = useCallback(() => { const audio = context.current; context.current = null; if (audio) void audio.close(); setPlaying(false); setLoading(false) }, [])
  useEffect(() => { if (!workspaceActive) stop() }, [workspaceActive, stop])
  useEffect(() => { stop(); setPosition(from) }, [score, bpm, from, to, loop, octave, instrument, chordInstrument, melodyEnabled, chordsEnabled, stop])
  useEffect(() => () => { const audio = context.current; context.current = null; if (audio) void audio.close() }, [])

  const play = async () => {
    stop(); setError('')
    if (!(bpm >= 20 && bpm <= 300 && to - from >= 0.05 && from >= 0) || !score.beats || !score.beatType) return
    const audio = new AudioContext()
    context.current = audio
    setLoading(true)
    try { await audio.resume(); await usePlaybackStore.getState().active?.pause() } catch { if (context.current === audio) { setError('Audio could not start. Stop the other player and try again.'); stop() }; return }
    if (context.current !== audio) return
    const inRange = (note: { start: number; duration: number }) => note.start < to && note.start + note.duration > from
    const notes = melodyEnabled ? score.notes.filter(note => note.midi !== null && inRange(note)) : []
    const chords = chordsEnabled ? (score.chords ?? []).filter(inRange).flatMap(chord => chord.midi.map(midi => ({ ...chord, midi }))) : []
    const events = [...notes.map(note => ({ ...note, chord: false })), ...chords.map(note => ({ ...note, chord: true }))]
    let playNote: Awaited<ReturnType<typeof prepareInstrument>>, playChord: Awaited<ReturnType<typeof prepareInstrument>>
    try {
      ;[playNote, playChord] = await Promise.all([prepareInstrument(audio, instrument, notes.map(note => note.midi! + octave * 12)), prepareInstrument(audio, chordInstrument, chords.map(chord => chord.midi))])
    } catch (error) { if (context.current === audio) { setError(error instanceof Error ? error.message : 'Sound could not load.'); stop() }; return }
    if (context.current !== audio) return
    setLoading(false)
    setPlaying(true)
    const secondsPerBeat = 60 / bpm
    const duration = (to - from) * secondsPerBeat
    const startsAt = audio.currentTime + 0.06
    const clickOutput = audio.createGain(); clickOutput.gain.value = clickEnabled.current ? 1 : 0; clickOutput.connect(audio.destination); clickGain.current = clickOutput
    const clicks = metronomeBeats(score, from, to)
    let scheduledThrough = startsAt
    const tick = () => {
      if (context.current !== audio) return
      const now = audio.currentTime
      const horizon = now + 0.15
      const firstCycle = Math.max(0, Math.floor((scheduledThrough - startsAt) / duration))
      const lastCycle = loop ? Math.floor((horizon - startsAt) / duration) : 0
      for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
        for (const click of clicks) {
          const when = startsAt + cycle * duration + (click.beat - from) * secondsPerBeat
          if (when < scheduledThrough || when >= horizon) continue
          const oscillator = audio.createOscillator(), gain = audio.createGain()
          oscillator.type = 'sine'; oscillator.frequency.value = click.accent ? 1600 : 1000
          gain.gain.setValueAtTime(click.accent ? 0.24 : 0.15, when)
          gain.gain.exponentialRampToValueAtTime(0.001, when + 0.035)
          oscillator.connect(gain); gain.connect(clickOutput)
          oscillator.start(when); oscillator.stop(when + 0.04)
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        }
        for (const note of events) {
          const when = startsAt + cycle * duration + (Math.max(from, note.start) - from) * secondsPerBeat
          if (when < scheduledThrough || when >= horizon) continue
          const length = Math.max(0.01, (Math.min(to, note.start + note.duration) - Math.max(from, note.start)) * secondsPerBeat)
          if (note.chord) playChord(note.midi!, when, length, 0.12)
          else playNote(note.midi! + octave * 12, when, length, 0.28)
        }
      }
      scheduledThrough = horizon
      const elapsed = Math.max(0, now - startsAt)
      setPosition(from + (loop ? elapsed % duration : Math.min(elapsed, duration)) / secondsPerBeat)
      if (!loop && elapsed >= duration) { stop(); return }
      timer = window.setTimeout(tick, 25)
    }
    let timer = 0
    audio.onstatechange = () => { if (audio.state === 'closed') window.clearTimeout(timer) }
    tick()
  }
  return { playing, loading, position, play, stop, error }
}
