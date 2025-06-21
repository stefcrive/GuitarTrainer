"use client"

import { forwardRef, useRef, useState, useImperativeHandle, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Square } from "lucide-react"
import { ChordOrScale, STANDARD_TUNING } from "@/types/guitar"
import { useScalesStore } from "@/stores/scales-store"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

interface ChordPlayerProps {
  rootNote: string
  customIntervals: number[]
  onPlayingChange?: (isPlaying: boolean) => void
  octaveOffset?: number
  setOctaveOffset?: (octave: number) => void
}

// Map of note names to their frequencies (A4 = 440Hz)
// Base frequencies for C4 octave
const NOTE_FREQUENCIES: { [key: string]: number } = {
  'C': 261.63,  // C4
  'C#': 277.18, // C#4
  'D': 293.66,  // D4
  'D#': 311.13, // D#4
  'E': 329.63,  // E4
  'F': 349.23,  // F4
  'F#': 369.99, // F#4
  'G': 392.00,  // G4
  'G#': 415.30, // G#4
  'A': 440.00,  // A4
  'A#': 466.16, // A#4
  'B': 493.88   // B4
}

// Define the base octave shifts for standard tuning (relative to the frequencies above)
const STRING_OCTAVE_SHIFTS: { [key: string]: { [key: number]: number } } = {
  'E': { 0: -1, 5: 1 },  // Low E (E2) on string 0, High E (E4) on string 5
  'A': { 1: -1 },        // A2 on string 1
  'D': { 2: 0 },         // D3 on string 2
  'G': { 3: 0 },         // G3 on string 3
  'B': { 4: 0 }          // B3 on string 4
}

export const ChordPlayer = forwardRef<
  {
    playChord: () => void;
    stopChord: () => void;
    playNote: (frequency: number, stringName?: string, stringIndex?: number, fretNumber?: number, octaveOffset?: number) => void
  },
  ChordPlayerProps
>(function ChordPlayer({ rootNote, customIntervals, onPlayingChange, octaveOffset, setOctaveOffset }, ref) {
  const [isPlaying, setIsPlaying] = useState(false)
  
  const {
    volume: storeVolume,
    instrument: storeInstrument,
    octaveSplit: storeOctaveSplit,
    reverbEnabled: storeReverbEnabled,
    reverbAmount: storeReverbAmount,
    decayLength: storeDecayLength,
    noteVolume: storeNoteVolume,
    setVolume: setStoreVolume,
    setInstrument: setStoreInstrument,
    setOctaveSplit: setStoreOctaveSplit,
    setReverbEnabled: setStoreReverbEnabled,
    setReverbAmount: setStoreReverbAmount,
    setDecayLength: setStoreDecayLength,
    setNoteVolume: setStoreNoteVolume
  } = useScalesStore()

  const [volume, setVolume] = useState([storeVolume])
  
  useEffect(() => {
    setStoreVolume(volume[0])
  }, [volume, setStoreVolume])
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorsRef = useRef<OscillatorNode[]>([])
  const gainNodesRef = useRef<GainNode[]>([])
  const convolverRef = useRef<ConvolverNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)

  const createImpulseResponse = (audioContext: AudioContext, duration: number = 2.5) => {
    const sampleRate = audioContext.sampleRate
    const length = sampleRate * duration
    const impulse = audioContext.createBuffer(2, length, sampleRate)
    const leftChannel = impulse.getChannelData(0)
    const rightChannel = impulse.getChannelData(1)

    for (let i = 0; i < length; i++) {
      const amplitude = Math.pow(1 - i / length, 2)
      leftChannel[i] = (Math.random() * 2 - 1) * amplitude
      rightChannel[i] = (Math.random() * 2 - 1) * amplitude
    }

    return impulse
  }

  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
      const ctx = audioContextRef.current

      convolverRef.current = ctx.createConvolver()
      convolverRef.current.buffer = createImpulseResponse(ctx)

      dryGainRef.current = ctx.createGain()
      wetGainRef.current = ctx.createGain()

      dryGainRef.current.connect(ctx.destination)
      wetGainRef.current.connect(convolverRef.current)
      convolverRef.current.connect(ctx.destination)

      wetGainRef.current.gain.value = storeReverbEnabled ? storeReverbAmount : 0
      dryGainRef.current.gain.value = 1
    }
  }

  useEffect(() => {
    return () => {
      stopChord()
      wetGainRef.current?.disconnect()
      dryGainRef.current?.disconnect()
      convolverRef.current?.disconnect()
      audioContextRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (wetGainRef.current) {
      wetGainRef.current.gain.value = storeReverbEnabled ? storeReverbAmount : 0
    }
  }, [storeReverbEnabled, storeReverbAmount])

  useEffect(() => {
    if (isPlaying) {
      restartChord()
    }
  }, [customIntervals])

  // Frequencies for note names at octave 0 (C0 = 16.35 Hz)
  const NOTE_FREQS_OCT0: { [key: string]: number } = {
    'C': 16.35,
    'C#': 17.32,
    'D': 18.35,
    'D#': 19.45,
    'E': 20.60,
    'F': 21.83,
    'F#': 23.12,
    'G': 24.50,
    'G#': 25.96,
    'A': 27.50,
    'A#': 29.14,
    'B': 30.87
  }

  // Get the frequency for a note name and octave (e.g., E1)
  function getNoteFrequency(noteWithOctave: string): number {
    const match = noteWithOctave.match(/^([A-G]#?)(\d)$/)
    if (!match) return 0
    const [, note, octaveStr] = match
    const octave = parseInt(octaveStr, 10)
    const base = NOTE_FREQS_OCT0[note]
    return base * Math.pow(2, octave)
  }

  // Calculate the frequency for a string and fret
  const calculateNoteFrequency = (note: string, stringIndex?: number, fretNumber: number = 0) => {
    if (stringIndex === undefined) return NOTE_FREQUENCIES[note]
    const openString = STANDARD_TUNING[stringIndex] // e.g., 'E1'
    const openFreq = getNoteFrequency(openString)
    // Each fret is a semitone: multiply by 2^(n/12)
    return openFreq * Math.pow(2, fretNumber / 12)
  }

  const createOscillator = (frequency: number, interval: number, audioContext: AudioContext, totalNotes: number) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.type = storeInstrument
    
    let adjustedFrequency = frequency
    if (storeOctaveSplit && interval > 0) {
      // For non-root notes in chord, shift up octaves based on interval
      const octaveShift = Math.floor(interval / 12)
      adjustedFrequency *= Math.pow(2, octaveShift)
    }
    
    oscillator.frequency.setValueAtTime(adjustedFrequency, audioContext.currentTime)
    
    const baseGain = volume[0] * (1 / Math.max(Math.sqrt(totalNotes), 1))
    gainNode.gain.setValueAtTime(baseGain, audioContext.currentTime)
    
    oscillator.connect(gainNode)

    if (dryGainRef.current && wetGainRef.current) {
      gainNode.connect(dryGainRef.current)
      gainNode.connect(wetGainRef.current)
    } else {
      gainNode.connect(audioContext.destination)
    }
    
    gainNodesRef.current.push(gainNode)
    return oscillator
  }

  const playNote = (
    frequency: number,
    stringName?: string,
    stringIndex?: number,
    fretNumber?: number,
    octaveOffset: number = 0
  ) => {
    if (!audioContextRef.current) {
      initializeAudioContext()
    }
    
    const audioContext = audioContextRef.current
    if (!audioContext) return

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.type = storeInstrument

    let adjustedFrequency = frequency
    if (stringIndex !== undefined && fretNumber !== undefined) {
      // Always use the open string frequency and semitone steps for each fret
      const openString = STANDARD_TUNING[stringIndex]
      const openFreq = getNoteFrequency(openString)
      adjustedFrequency = openFreq * Math.pow(2, fretNumber / 12 + octaveOffset)
    } else if (octaveOffset) {
      adjustedFrequency = frequency * Math.pow(2, octaveOffset)
    }

    oscillator.frequency.setValueAtTime(adjustedFrequency, audioContext.currentTime)
    
    gainNode.gain.setValueAtTime(storeNoteVolume, audioContext.currentTime)
    
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + storeDecayLength
    )
    
    oscillator.connect(gainNode)
    if (dryGainRef.current && wetGainRef.current) {
      gainNode.connect(dryGainRef.current)
      gainNode.connect(wetGainRef.current)
    } else {
      gainNode.connect(audioContext.destination)
    }
    
    oscillator.start()
    oscillator.stop(audioContext.currentTime + storeDecayLength)
    
    setTimeout(() => {
      oscillator.disconnect()
      gainNode.disconnect()
    }, storeDecayLength * 1000)
  }

  const updateVolume = (newVolume: number[]) => {
    setVolume(newVolume)
    const totalNotes = oscillatorsRef.current.length || 1
    gainNodesRef.current.forEach(gainNode => {
      const baseGain = newVolume[0] * (1 / Math.max(Math.sqrt(totalNotes), 1))
      gainNode.gain.setValueAtTime(baseGain, audioContextRef.current?.currentTime || 0)
    })
  }

  const startChord = () => {
    if (!rootNote || !customIntervals.length) return

    initializeAudioContext()
    
    const audioContext = audioContextRef.current
    if (!audioContext) return
    
    // Use C3 string (index 1) as reference for chord root note
    const rootFreq = calculateNoteFrequency(rootNote, 1, 0)
    const totalNotes = customIntervals.length + 1

    const oscillators = [
      createOscillator(rootFreq, 0, audioContext, totalNotes),
      ...customIntervals.map(interval => {
        // Calculate frequency with octave shifts from intervals
        const freq = rootFreq * Math.pow(2, interval / 12)
        return createOscillator(freq, interval, audioContext, totalNotes)
      })
    ]

    oscillators.forEach(osc => osc.start())
    oscillatorsRef.current = oscillators
    setIsPlaying(true)
    onPlayingChange?.(true)
  }

  const stopChord = () => {
    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop()
        osc.disconnect()
      } catch (e) {
        // Ignore errors from already stopped oscillators
      }
    })
    
    gainNodesRef.current.forEach(gain => {
      try {
        gain.disconnect()
      } catch (e) {
        // Ignore errors from already disconnected gains
      }
    })
    
    oscillatorsRef.current = []
    gainNodesRef.current = []
    setIsPlaying(false)
    onPlayingChange?.(false)
  }

  const restartChord = () => {
    stopChord()
    setTimeout(() => {
      startChord()
    }, 50)
  }

  const togglePlay = () => {
    if (isPlaying) {
      stopChord()
    } else {
      startChord()
    }
  }

  useImperativeHandle(ref, () => ({
    playChord: () => {
      stopChord()
      startChord()
    },
    stopChord,
    playNote
  }))

  return (
    <div className="space-y-8">
      {/* Controls Row - Play, Wave, Octave Split, Volumes, Reverb, Decay, Octave */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlay}
          disabled={!rootNote || !customIntervals.length}
        >
          {isPlaying ? (
            <Square className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        <Select
          value={storeInstrument}
          onValueChange={(value: OscillatorType) => {
            setStoreInstrument(value)
            if (isPlaying) restartChord()
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sine">Harmonic Sine</SelectItem>
            <SelectItem value="triangle">Triangle Wave</SelectItem>
            <SelectItem value="square">Square Wave</SelectItem>
            <SelectItem value="sawtooth">Sawtooth Wave</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={storeOctaveSplit ? "default" : "outline"}
          size="sm"
          onClick={() => setStoreOctaveSplit(!storeOctaveSplit)}
        >
          Octave Split
        </Button>

        {/* Chord Volume */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Chord Vol</span>
          <Slider
            className="w-24"
            value={volume}
            onValueChange={updateVolume}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        {/* Note Volume */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Note Vol</span>
          <Slider
            className="w-24"
            value={[storeNoteVolume]}
            onValueChange={values => setStoreNoteVolume(values[0])}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        {/* Reverb */}
        <div className="flex items-center gap-2">
          <Button
            variant={storeReverbEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setStoreReverbEnabled(!storeReverbEnabled)}
          >
            Reverb
          </Button>
          {storeReverbEnabled && (
            <Slider
              className="w-24"
              value={[storeReverbAmount]}
              onValueChange={values => setStoreReverbAmount(values[0])}
              min={0}
              max={1}
              step={0.01}
            />
          )}
        </div>

        {/* Decay */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Decay</span>
          <Slider
            className="w-24"
            value={[storeDecayLength]}
            onValueChange={values => setStoreDecayLength(values[0])}
            min={0.1}
            max={3}
            step={0.1}
          />
          <span className="text-sm text-muted-foreground">{storeDecayLength.toFixed(1)}s</span>
        </div>
        {/* Octave Selector */}
        {typeof octaveOffset === "number" && typeof setOctaveOffset === "function" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Octave</span>
            <Select value={octaveOffset.toString()} onValueChange={v => setOctaveOffset(Number(v))}>
              <SelectTrigger className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4].map(oct => (
                  <SelectItem key={oct} value={oct.toString()}>{`+${oct}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )
})