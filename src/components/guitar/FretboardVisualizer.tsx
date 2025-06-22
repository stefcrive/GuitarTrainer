"use client"

import { useRef, useState, useEffect } from "react"
import { STANDARD_TUNING, TOTAL_FRETS, type ChordOrScale } from "@/types/guitar"
import { cn } from "@/lib/utils"
import { getAllItems } from "@/data/guitar-library"
import { ChordPlayer } from "./ChordPlayer"
import { getNoteAtFret, isNoteInIntervals, getIntervalName } from "@/utils/guitar-utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HarmonicProgression } from "./HarmonicProgression"

// Map of note names to their frequencies (A4 = 440Hz)
const NOTE_FREQUENCIES: { [key: string]: number } = {
  'C': 261.63,
  'C#': 277.18,
  'D': 293.66,
  'D#': 311.13,
  'E': 329.63,
  'F': 349.23,
  'F#': 369.99,
  'G': 392.00,
  'G#': 415.30,
  'A': 440.00,
  'A#': 466.16,
  'B': 493.88
}

const INTERVALS = [
  // Basic intervals
  { semitones: 1, name: "♭2" },
  { semitones: 2, name: "2" },
  { semitones: 3, name: "♭3" },
  { semitones: 4, name: "3" },
  { semitones: 5, name: "4" },
  { semitones: 6, name: "♭5" },
  { semitones: 7, name: "5" },
  { semitones: 8, name: "♭6" },
  { semitones: 9, name: "6" },
  { semitones: 10, name: "♭7" },
  { semitones: 11, name: "7" },
  { semitones: 12, name: "8" }, // Octave
  // Extended intervals
  { semitones: 13, name: "♭9" },
  { semitones: 14, name: "9" },
  { semitones: 15, name: "♯9" },
  { semitones: 17, name: "11" },
  { semitones: 18, name: "♯11" },
  { semitones: 21, name: "13" }
]

type FretboardVisualizerProps = {
  selectedItem: ChordOrScale | null
  rootNote: string
  onRootNoteChange: (note: string) => void
  customIntervals: number[]
  onCustomIntervalsChange: (intervals: number[]) => void
  onItemSelect?: (item: ChordOrScale | null) => void
}

export function FretboardVisualizer({
  selectedItem,
  rootNote,
  onRootNoteChange,
  customIntervals,
  onCustomIntervalsChange,
  onItemSelect
}: FretboardVisualizerProps) {
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [showAllIntervals, setShowAllIntervals] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)
  const [frozenIntervals, setFrozenIntervals] = useState<number[]>([])
  const [frozenRootNote, setFrozenRootNote] = useState("")
  const [frozenSelectedItem, setFrozenSelectedItem] = useState<ChordOrScale | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  // Octave offset: 0 to +4, default +2
  const [octaveOffset, setOctaveOffset] = useState(2)
  const chordPlayerRef = useRef<{
    playChord: () => void
    stopChord: () => void
    playNote: (frequency: number, stringName?: string, stringIndex?: number, fretNumber?: number, octaveOffset?: number) => void
  } | null>(null)
  
  const strings = STANDARD_TUNING
  const frets = Array.from({ length: TOTAL_FRETS + 1 }, (_, i) => i)
  const currentIntervals = selectedItem?.intervals || customIntervals

  // Handle changes in intervals or selected item
  useEffect(() => {
    if (isPlaying && chordPlayerRef.current) {
      chordPlayerRef.current.stopChord()
      setTimeout(() => {
        if (isPlaying && chordPlayerRef.current) {
          chordPlayerRef.current.playChord()
        }
      }, 50)
    }
  }, [currentIntervals, selectedItem])

  // Stop playing when root note changes
  useEffect(() => {
    if (chordPlayerRef.current && isPlaying) {
      chordPlayerRef.current.stopChord()
      setIsPlaying(false)
    }
  }, [rootNote])

  function isNoteHighlighted(note: string, intervals: number[], noteRoot: string) {
    return isNoteInIntervals(note, noteRoot, intervals)
  }

  function getNoteIntervalName(note: string, intervals: number[], noteRoot: string) {
    return getIntervalName(note, noteRoot, intervals)
  }

  function toggleInterval(semitones: number) {    
    if (selectedItem) {
      // Store current intervals before clearing selection
      const previousIntervals = selectedItem.intervals
      
      // Clear the selected chord
      onItemSelect?.(null)

      // Update custom intervals with previous chord intervals
      onCustomIntervalsChange(
        previousIntervals.includes(semitones)
          ? previousIntervals.filter(i => i !== semitones)
          : [...previousIntervals, semitones]
      )
      
      return
    }

    // In custom mode
    onCustomIntervalsChange(
      customIntervals.includes(semitones)
        ? customIntervals.filter(i => i !== semitones)
        : [...customIntervals, semitones]
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Interval Selection */}
      <div className="flex items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Select value={rootNote} onValueChange={onRootNoteChange}>
            <SelectTrigger className="h-9 px-3 bg-background hover:bg-accent">
              <SelectValue>Root: {rootNote}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map(note => (
                <SelectItem key={note} value={note}>{note}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {INTERVALS.map(interval => (
          <Button
            key={interval.semitones}
            variant={currentIntervals.includes(interval.semitones) ? "default" : "outline"}
            size="sm"
            onClick={() => toggleInterval(interval.semitones)}
            disabled={interval.semitones === 0} // Only disable root note
          >
            {interval.name}
          </Button>
          ))}

          {/* Play Button */}
          <ChordPlayer
            ref={chordPlayerRef}
            rootNote={rootNote}
            customIntervals={currentIntervals}
            onPlayingChange={setIsPlaying}
            octaveOffset={octaveOffset}
            setOctaveOffset={setOctaveOffset}
          />
        </div>
      </div>

      {/* Display selected item name */}
      <div className="text-center text-lg font-semibold">
        {isFrozen && frozenSelectedItem ? (
          <>
            <span className="text-blue-500">Frozen: {frozenRootNote} {frozenSelectedItem.name}</span>
            {selectedItem && (
              <span className="ml-4 text-primary">
                (Current: {rootNote} {selectedItem.name})
              </span>
            )}
          </>
        ) : selectedItem ? (
          <span className="text-primary">Selected: {rootNote} {selectedItem.name}</span>
        ) : (
          <span>Select a chord or scale</span>
        )}
      </div>

      {/* Fretboard */}
      <div className="relative w-full overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Fret numbers */}
          <div className="flex border-b">
            <div className="w-12"></div>
            {frets.map(fret => (
              <div key={fret} className="flex-1 text-center py-2">
                {fret}
              </div>
            ))}
          </div>

          {/* Strings */}
          {strings.map((tuning, stringIndex) => (
            <div key={stringIndex} className="flex border-b last:border-b-2">
              {/* Tuning */}
              <div className="w-12 flex items-center justify-center font-bold">
                {tuning}
              </div>

              {/* Frets */}
              {frets.map((fret) => {
                const note = getNoteAtFret(tuning, fret)
                const isHighlighted = isNoteHighlighted(note, currentIntervals, rootNote)
                const isFrozenHighlighted = isFrozen && isNoteHighlighted(note, frozenIntervals, frozenRootNote)
                const intervalName = getNoteIntervalName(note, currentIntervals, rootNote)
                const frozenIntervalName = isFrozen && getNoteIntervalName(note, frozenIntervals, frozenRootNote)

                return (
                  <div
                    key={`${stringIndex}-${fret}`}
                    className={cn(
                      "flex-1 h-12 flex items-center justify-center border-r relative",
                      fret === 0 && "border-r-2 border-r-gray-500",
                      fret === 11 && "border-r-2 border-r-gray-500",
                      "cursor-pointer hover:bg-accent/10",
                      // Apply base background color to the fret cell
                      isFrozenHighlighted && "bg-blue-500/10", // Blue background if frozen
                      isHighlighted && !isFrozenHighlighted && "bg-primary/10" // Primary background if only current
                    )}
                    onClick={() => {
                      const freq = NOTE_FREQUENCIES[note]
                      if (freq && chordPlayerRef.current) {
                        chordPlayerRef.current.playNote(
                          freq,
                          tuning,
                          stringIndex,
                          fret,
                          octaveOffset // pass octave offset
                        )
                      }
                    }}
                  >
                    {/* Fret markers */}
                    {stringIndex === 2 && [3, 5, 7, 9, 15].includes(fret) && (
                      <div className="absolute w-4 h-4 rounded-full bg-gray-300"></div>
                    )}
                    {stringIndex === 2 && fret === 12 && (
                      <>
                        <div className="absolute w-4 h-4 rounded-full bg-gray-300 -ml-6"></div>
                        <div className="absolute w-4 h-4 rounded-full bg-gray-300 ml-6"></div>
                      </>
                    )}

                    {/* Note display */}
                    {(isHighlighted || isFrozenHighlighted || showAllNotes || showAllIntervals) && (
                      // This div will be the "inner" colored circle/square
                      <div className={cn(
                        "absolute flex flex-col items-center justify-center rounded",
                        // If both are highlighted, this div is smaller and primary, revealing blue from outer div
                        isHighlighted && isFrozenHighlighted ? "inset-[5px] bg-primary/40" : "inset-1",
                        // If only current is highlighted, this div is primary and full size
                        isHighlighted && !isFrozenHighlighted ? "bg-primary/20" : "",
                        // If only frozen is highlighted, this div is blue and full size
                        !isHighlighted && isFrozenHighlighted ? "bg-blue-500/20" : ""
                      )}>
                        <div className="text-base font-bold">
                          {showAllIntervals
                            ? getIntervalName(note, rootNote, [0,1,2,3,4,5,6,7,8,9,10,11])
                            : isHighlighted
                               ? intervalName
                               : isFrozenHighlighted
                                 ? frozenIntervalName
                                 : ""
                          }
                        </div>
                        <div className="text-xs text-muted-foreground/60">
                          {showAllNotes
                            ? note
                            : isHighlighted
                               ? note
                               : isFrozenHighlighted
                                 ? note
                                 : ""
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Display Options */}
      <div className="flex gap-2 justify-center mt-4">
        <Button
          variant={showAllNotes ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setShowAllNotes(!showAllNotes)
            setShowAllIntervals(false)
          }}
        >
          Show Notes
        </Button>
        <Button
          variant={showAllIntervals ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setShowAllIntervals(!showAllIntervals)
            setShowAllNotes(false)
          }}
        >
          Show Intervals
        </Button>
        <Button
          variant={isFrozen ? "default" : "outline"}
          size="sm"
          onClick={() => {
            if (isFrozen) {
              setIsFrozen(false)
              setFrozenIntervals([])
              setFrozenRootNote("")
              setFrozenSelectedItem(null)
            } else {
              setIsFrozen(true)
              setFrozenIntervals(currentIntervals)
              setFrozenRootNote(rootNote)
              setFrozenSelectedItem(selectedItem)
            }
          }}
        >
          Freeze
        </Button>
      </div>

      {/* Harmonic Progression */}
      {isFrozen ? (
        <>
          {frozenSelectedItem?.category === 'scale' && frozenSelectedItem.parentScale && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Frozen Harmonic Progression:</h3>
              <HarmonicProgression selectedScale={frozenSelectedItem} />
            </div>
          )}
          {selectedItem?.category === 'scale' && selectedItem.parentScale &&
           frozenSelectedItem && (selectedItem.name !== frozenSelectedItem.name || rootNote !== frozenRootNote) && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Current Harmonic Progression:</h3>
              <HarmonicProgression selectedScale={selectedItem} />
            </div>
          )}
        </>
      ) : (
        selectedItem?.category === 'scale' && selectedItem.parentScale && (
          <HarmonicProgression selectedScale={selectedItem} />
        )
      )}
    </div>
  )
}