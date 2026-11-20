'use client'

import { useSoundStore } from '@/stores/sound-store'
import { useScalesStore } from '@/stores/scales-store'
import { SoundSelector } from './SoundSelector'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
export function SoundSettings() {
  const { notation, chords, setSound } = useSoundStore()
  const { instrument, setInstrument } = useScalesStore()
  return <section className="space-y-3 rounded-lg border p-4">
    <div className="flex items-center gap-1"><h3 className="text-lg font-semibold">Playback sounds</h3><MarkerHelp label="Defaults for new notation scores and the scales page. Saved scores retain their own sounds. Sampled instruments are bundled for offline playback. FluidR3 samples by Frank Wen / midi-js-soundfonts, CC BY 3.0; license at /sounds/LICENSE.md." /></div>
    <div className="flex flex-wrap gap-4"><SoundSelector label="Notation" value={notation} onChange={value => setSound('notation', value)} /><SoundSelector label="Chord track" value={chords} onChange={value => setSound('chords', value)} /><SoundSelector label="Scales" value={instrument} onChange={setInstrument} /></div>
  </section>
}
