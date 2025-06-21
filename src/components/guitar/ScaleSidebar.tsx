"use client"

import { Button } from "@/components/ui/button"
import { getAllItems } from "@/data/guitar-library"
import { ChordOrScale } from "@/types/guitar"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useScalesStore } from "@/stores/scales-store"

type ScaleSidebarProps = {
  selectedItem: ChordOrScale | null
  onItemSelect: (item: ChordOrScale) => void
}

export function ScaleSidebar({
  selectedItem,
  onItemSelect,
}: ScaleSidebarProps) {
  const {
    activeTab,
    expandedScales,
    expandedChords,
    setActiveTab,
    toggleScaleExpansion,
    toggleChordExpansion
  } = useScalesStore()
  
  const items = getAllItems()

  // Filter items by category
  const allScales = items.filter(item => item.category === "scale") as Array<ChordOrScale & { parentScale?: string }>
  const allChords = items.filter(item => item.category === "chord") as Array<ChordOrScale & { parentGroup?: string }>

  // Group scales by their parent scale
  const scaleGroups = allScales.reduce((acc, scale) => {
    const parentScale = scale.parentScale || scale.name
    if (!acc[parentScale]) {
      acc[parentScale] = []
    }
    acc[parentScale].push(scale)
    return acc
  }, {} as Record<string, typeof allScales>)

  // Group chords by their parent group
  const chordGroups = allChords.reduce((acc, chord) => {
    const parentGroup = chord.parentGroup || chord.name
    if (!acc[parentGroup]) {
      acc[parentGroup] = []
    }
    acc[parentGroup].push(chord)
    return acc
  }, {} as Record<string, typeof allChords>)

  // Scale groups order
  const scaleOrder = ["Major", "Harmonic Minor", "Melodic Minor", "Symmetric", "Pentatonic", "Blues"]
  const orderedScaleGroups = scaleOrder.map(name => ({
    name,
    scales: scaleGroups[name] || []
  }))

  // Chord groups order
  const chordOrder = ["Major", "Minor", "Seventh", "Augmented", "Diminished"]
  const orderedChordGroups = chordOrder.map(name => ({
    name,
    chords: chordGroups[name] || []
  }))


  return (
    <div className="w-64 h-full min-h-screen border-r bg-muted/30">
      <div className="p-4 space-y-4">
        {/* Scale/Chord Toggle */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === "scales" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setActiveTab("scales")}
          >
            Scales
          </Button>
          <Button
            variant={activeTab === "chords" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setActiveTab("chords")}
          >
            Chords
          </Button>
        </div>

        {/* Scales List */}
        {activeTab === "scales" && (
          <div className="space-y-2">
            {orderedScaleGroups.map(({ name: groupName, scales }) => (
              <div key={groupName} className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between font-medium"
                  onClick={() => toggleScaleExpansion(groupName)}
                >
                  {groupName}
                  {expandedScales.includes(groupName) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                {expandedScales.includes(groupName) && (
                  <div className="pl-4 space-y-1">
                    {scales.map(scale => (
                      <Button
                        key={scale.name}
                        variant={selectedItem?.name === scale.name ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onItemSelect(scale)}
                      >
                        {scale.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Chords List */}
        {activeTab === "chords" && (
          <div className="space-y-2">
            {orderedChordGroups.map(({ name: groupName, chords }) => (
              <div key={groupName} className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between font-medium"
                  onClick={() => toggleChordExpansion(groupName)}
                >
                  {groupName}
                  {expandedChords.includes(groupName) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                {expandedChords.includes(groupName) && (
                  <div className="pl-4 space-y-1">
                    {chords.map(chord => (
                      <Button
                        key={chord.name}
                        variant={selectedItem?.name === chord.name ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onItemSelect(chord)}
                      >
                        {chord.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}