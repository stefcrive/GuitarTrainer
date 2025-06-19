"use client"

import { useState } from "react"
import { FretboardVisualizer } from "@/components/guitar/FretboardVisualizer"
import { ScaleSidebar } from "@/components/guitar/ScaleSidebar"
import { HarmonicProgression } from "@/components/guitar/HarmonicProgression"
import { Header } from "@/components/layout/Header"
import { ChordOrScale } from "@/types/guitar"

export default function ScalesPage() {
  const [selectedItem, setSelectedItem] = useState<ChordOrScale | null>(null)
  const [rootNote, setRootNote] = useState("C")
  const [customIntervals, setCustomIntervals] = useState<number[]>([0])

  const handleItemSelect = (item: ChordOrScale) => {
    setSelectedItem(item)
    setCustomIntervals(item.intervals)
  }

  const handleCustomIntervalsChange = (intervals: number[]) => {
    const newIntervals = intervals.includes(0) ? intervals : [0, ...intervals]
    setCustomIntervals(newIntervals)
    setSelectedItem(null)
  }

  return (
    <div>
      <Header />
      <div className="flex">
        <ScaleSidebar
          selectedItem={selectedItem}
          onItemSelect={handleItemSelect}
          rootNote={rootNote}
          onRootNoteChange={setRootNote}
        />
        <div className="flex-1 p-8">
          <h1 className="text-3xl font-bold mb-6">Scales & Chords</h1>
          <FretboardVisualizer
            selectedItem={selectedItem}
            rootNote={rootNote}
            onRootNoteChange={setRootNote}
            customIntervals={customIntervals}
            onCustomIntervalsChange={handleCustomIntervalsChange}
          />
          {selectedItem?.category === "scale" && (
            <HarmonicProgression
              selectedScale={selectedItem}
              className="mt-8"
            />
          )}
        </div>
      </div>
    </div>
  )
}