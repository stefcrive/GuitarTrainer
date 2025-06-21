import { create } from 'zustand'
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

export const useScalesStore = create<ScalesState>((set) => ({
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
  setSelectedItem: (item) => set({ selectedItem: item }),
  setRootNote: (note) => set({ rootNote: note }),
  setCustomIntervals: (intervals) => set({ customIntervals: intervals }),
  
  // Sound settings actions
  setVolume: (volume) => set({ volume }),
  setNoteVolume: (noteVolume) => set({ noteVolume }),
  setInstrument: (instrument) => set({ instrument }),
  setOctaveSplit: (octaveSplit) => set({ octaveSplit }),
  setReverbEnabled: (reverbEnabled) => set({ reverbEnabled }),
  setReverbAmount: (reverbAmount) => set({ reverbAmount }),
  setDecayLength: (decayLength) => set({ decayLength }),

  // Sidebar actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleScaleExpansion: (scale) => set((state) => ({
    expandedScales: state.expandedScales.includes(scale)
      ? state.expandedScales.filter(s => s !== scale)
      : [...state.expandedScales, scale]
  })),
  toggleChordExpansion: (chord) => set((state) => ({
    expandedChords: state.expandedChords.includes(chord)
      ? state.expandedChords.filter(c => c !== chord)
      : [...state.expandedChords, chord]
  }))
}))