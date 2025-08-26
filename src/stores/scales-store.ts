import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChordOrScale } from '@/types/guitar'

interface ScalesState {
  // Scale/Chord selection
  selectedItem: ChordOrScale | null
  rootNote: string
  customIntervals: number[]
  
  // Sound settings
  volume: number            // For chord playback
  noteVolume: number       // For individual note playback
  instrument: OscillatorType
  octaveSplit: boolean
  reverbEnabled: boolean
  reverbAmount: number
  decayLength: number      // In seconds

  // Sidebar state
  activeTab: 'scales' | 'chords'
  expandedScales: string[]
  expandedChords: string[]
  
  // Scale/Chord actions
  setSelectedItem: (item: ChordOrScale | null) => void
  setRootNote: (note: string) => void
  setCustomIntervals: (intervals: number[]) => void
  
  // Sound settings actions
  setVolume: (volume: number) => void
  setNoteVolume: (volume: number) => void
  setInstrument: (type: OscillatorType) => void
  setOctaveSplit: (enabled: boolean) => void
  setReverbEnabled: (enabled: boolean) => void
  setReverbAmount: (amount: number) => void
  setDecayLength: (seconds: number) => void

  // Sidebar actions
  setActiveTab: (tab: 'scales' | 'chords') => void
  toggleScaleExpansion: (scale: string) => void
  toggleChordExpansion: (chord: string) => void
}

export const useScalesStore = create<ScalesState>()(
  persist(
    (set, get) => ({
      // Initial scale/chord state
      selectedItem: null,
      rootNote: 'C',
      customIntervals: [0],
      
      // Initial sound settings
      volume: 0.5,
      noteVolume: 0.7,
      instrument: 'sine' as OscillatorType,
      octaveSplit: false,
      reverbEnabled: false,
      reverbAmount: 0.3,
      decayLength: 1.0,

      // Initial sidebar state
      activeTab: 'scales',
      expandedScales: ['Major'],
      expandedChords: ['Major'],
      
      // Scale/Chord actions
      setSelectedItem: (item: ChordOrScale | null) => set(() => ({ selectedItem: item })),
      setRootNote: (note: string) => set(() => ({ rootNote: note })),
      setCustomIntervals: (intervals: number[]) => set(() => ({ customIntervals: intervals })),
      
      // Sound settings actions
      setVolume: (volume: number) => set(() => ({ volume })),
      setNoteVolume: (noteVolume: number) => set(() => ({ noteVolume })),
      setInstrument: (instrument: OscillatorType) => set(() => ({ instrument })),
      setOctaveSplit: (octaveSplit: boolean) => set(() => ({ octaveSplit })),
      setReverbEnabled: (reverbEnabled: boolean) => set(() => ({ reverbEnabled })),
      setReverbAmount: (reverbAmount: number) => set(() => ({ reverbAmount })),
      setDecayLength: (decayLength: number) => set(() => ({ decayLength })),

      // Sidebar actions
      setActiveTab: (tab: 'scales' | 'chords') => set(() => ({ activeTab: tab })),
      toggleScaleExpansion: (scale: string) => set((state: ScalesState) => ({
        expandedScales: state.expandedScales.includes(scale)
          ? state.expandedScales.filter((s: string) => s !== scale)
          : [...state.expandedScales, scale]
      })),
      toggleChordExpansion: (chord: string) => set((state: ScalesState) => ({
        expandedChords: state.expandedChords.includes(chord)
          ? state.expandedChords.filter((c: string) => c !== chord)
          : [...state.expandedChords, chord]
      }))
    }),
    {
      name: 'scales-store',
    }
  )
)