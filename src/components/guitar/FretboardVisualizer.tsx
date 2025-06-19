"use client"

import { useState } from "react"
import { STANDARD_TUNING, TOTAL_FRETS, type ChordOrScale } from "@/types/guitar"
import { cn } from "@/lib/utils"
import { getAllItems } from "@/data/guitar-library"
import { getNoteAtFret, isNoteInIntervals, getIntervalName } from "@/utils/guitar-utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
}

export function FretboardVisualizer({
  selectedItem,
  rootNote,
  onRootNoteChange,
  customIntervals,
  onCustomIntervalsChange
}: FretboardVisualizerProps) {
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [showAllIntervals, setShowAllIntervals] = useState(false)
  const strings = STANDARD_TUNING
  const frets = Array.from({ length: TOTAL_FRETS + 1 }, (_, i) => i)

  function isNoteHighlighted(note: string) {
    const intervals = selectedItem ? selectedItem.intervals : customIntervals
    return isNoteInIntervals(note, rootNote, intervals)
  }

  function getNoteIntervalName(note: string) {
    const intervals = selectedItem ? selectedItem.intervals : customIntervals
    return getIntervalName(note, rootNote, intervals)
  }

  function toggleInterval(semitones: number) {
    onCustomIntervalsChange(
      customIntervals.includes(semitones)
        ? customIntervals.filter(i => i !== semitones)
        : [...customIntervals, semitones]
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Interval Selection & Display Options */}
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
            variant={customIntervals.includes(interval.semitones) ? "default" : "outline"}
            size="sm"
            onClick={() => toggleInterval(interval.semitones)}
            disabled={interval.semitones === 0} // Root is always selected
          >
            {interval.name}
          </Button>
          ))}
        </div>
        
        {/* Display Options */}
        <div className="flex gap-2 ml-4 border-l pl-4">
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
        </div>
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
                const isHighlighted = isNoteHighlighted(note)
                const intervalName = getNoteIntervalName(note)

                return (
                  <div
                    key={`${stringIndex}-${fret}`}
                    className={`
                      flex-1 h-12 flex items-center justify-center border-r relative
                      ${fret === 0 ? "border-r-2" : ""}
                      ${isHighlighted ? "bg-primary/10" : ""}
                    `}
                  >
                    {/* Fret markers */}
                    {stringIndex === 2 && [3, 5, 7, 9].includes(fret) && (
                      <div className="absolute w-4 h-4 rounded-full bg-gray-300"></div>
                    )}
                    {stringIndex === 2 && fret === 12 && (
                      <>
                        <div className="absolute w-4 h-4 rounded-full bg-gray-300 -ml-6"></div>
                        <div className="absolute w-4 h-4 rounded-full bg-gray-300 ml-6"></div>
                      </>
                    )}

                    {/* Note display */}
                    {(isHighlighted || showAllNotes || showAllIntervals) && (
                      <div className={cn(
                        "absolute inset-1 flex flex-col items-center justify-center rounded",
                        isHighlighted ? "bg-primary/20" : "bg-transparent"
                      )}>
                        <div className="text-base font-bold">
                          {showAllIntervals ? getIntervalName(note, rootNote, [0,1,2,3,4,5,6,7,8,9,10,11]) : intervalName}
                        </div>
                        <div className="text-xs text-muted-foreground/60">
                          {showAllNotes ? note : isHighlighted ? note : ""}
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
    </div>
  )
}