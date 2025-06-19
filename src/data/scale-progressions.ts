interface ScaleProgression {
  parentScale: string
  progression: Array<{
    name: string
    type: string
    modeNumber?: number // Used to highlight when its mode is selected
  }>
}

export const scaleProgressions: ScaleProgression[] = [
  {
    parentScale: "Major",
    progression: [
      { name: "I", type: "Major", modeNumber: 1 },      // Ionian
      { name: "ii", type: "Minor", modeNumber: 2 },     // Dorian
      { name: "iii", type: "Minor", modeNumber: 3 },    // Phrygian
      { name: "IV", type: "Major", modeNumber: 4 },     // Lydian
      { name: "V", type: "Major", modeNumber: 5 },      // Mixolydian
      { name: "vi", type: "Minor", modeNumber: 6 },     // Aeolian
      { name: "vii°", type: "Diminished", modeNumber: 7 } // Locrian
    ]
  },
  {
    parentScale: "Harmonic Minor",
    progression: [
      { name: "i", type: "Minor", modeNumber: 1 },         // Harmonic Minor
      { name: "ii°", type: "Diminished", modeNumber: 2 },  // Locrian ♯6
      { name: "III+", type: "Augmented", modeNumber: 3 },  // Ionian #5
      { name: "iv", type: "Minor", modeNumber: 4 },        // Dorian #4
      { name: "V", type: "Major", modeNumber: 5 },         // Phrygian Major
      { name: "VI", type: "Major", modeNumber: 6 },        // Lydian #2
      { name: "vii°", type: "Diminished", modeNumber: 7 }  // Super Locrian bb7
    ]
  },
  {
    parentScale: "Melodic Minor",
    progression: [
      { name: "i", type: "Minor", modeNumber: 1 },         // Melodic Minor
      { name: "ii", type: "Minor", modeNumber: 2 },        // Dorian b2
      { name: "III+", type: "Augmented", modeNumber: 3 },  // Lydian Augmented
      { name: "IV7", type: "Dominant", modeNumber: 4 },    // Lydian Dominant
      { name: "V7", type: "Dominant", modeNumber: 5 },     // Mixolydian b6
      { name: "vi°", type: "Half Diminished", modeNumber: 6 }, // Locrian #2
      { name: "vii°", type: "Half Diminished", modeNumber: 7 } // Super Locrian
    ]
  }
]

export function getScaleProgression(parentScale: string) {
  return scaleProgressions.find(p => p.parentScale === parentScale)
}

export function getModeNumberFromName(scaleName: string): number | undefined {
  // Map mode names directly to their numbers
  const modeMap = new Map([
    // Major scale modes
    ["Major (Ionian)", 1],
    ["Dorian", 2],
    ["Phrygian", 3],
    ["Lydian", 4],
    ["Mixolydian", 5],
    ["Aeolian", 6],
    ["Locrian", 7],

    // Harmonic Minor modes
    ["Harmonic Minor", 1],
    ["Locrian ♯6", 2],
    ["Ionian #5", 3],
    ["Dorian #4", 4],
    ["Phrygian Major", 5],
    ["Lydian #2", 6],
    ["Super Locrian ♭7", 7],

    // Melodic Minor modes
    ["Melodic Minor", 1],
    ["Dorian ♭2", 2],
    ["Lydian Augmented", 3],
    ["Lydian Dominant", 4],
    ["Mixolydian ♭6", 5],
    ["Locrian ♯2", 6],
    ["Super Locrian", 7]
  ])

  // Try to get the mode number directly
  const modeNumber = modeMap.get(scaleName)
  if (modeNumber) return modeNumber

  // If not found, try to extract mode number from common patterns in scale names
  for (const [key, value] of modeMap.entries()) {
    if (scaleName.includes(key)) {
      return value
    }
  }

  return undefined
}