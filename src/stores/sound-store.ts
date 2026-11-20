import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isInstrument, type Instrument } from '@/lib/instrument-audio'

interface SoundState {
  notation: Instrument
  chords: Instrument
  setSound: (track: 'notation' | 'chords', sound: Instrument) => void
}
export const useSoundStore = create<SoundState>()(persist((set) => ({
  notation: 'acoustic_guitar_nylon', chords: 'acoustic_grand_piano',
  setSound: (track, sound) => { if (isInstrument(sound)) set({ [track]: sound }) },
}), { name: 'instrument-sounds' }))
