import { Scale, Chord } from "@/types/guitar"

// Major scale modes
const MAJOR_MODES = {
  Ionian: [0, 2, 4, 5, 7, 9, 11],     // Major scale
  Dorian: [0, 2, 3, 5, 7, 9, 10],     // Minor scale with major 6th
  Phrygian: [0, 1, 3, 5, 7, 8, 10],   // Minor scale with flat 2nd
  Lydian: [0, 2, 4, 6, 7, 9, 11],     // Major scale with sharp 4th
  Mixolydian: [0, 2, 4, 5, 7, 9, 10], // Major scale with flat 7th
  Aeolian: [0, 2, 3, 5, 7, 8, 10],    // Natural minor scale
  Locrian: [0, 1, 3, 5, 6, 8, 10],    // Diminished scale
}

// Harmonic minor modes
const HARMONIC_MINOR_MODES = {
  HarmonicMinor: [0, 2, 3, 5, 7, 8, 11],    // Harmonic Minor
  LocrianSharp6: [0, 1, 3, 5, 6, 9, 10],    // Locrian ♯6
  IonianSharp5: [0, 2, 4, 5, 8, 9, 11],     // Ionian #5
  DorianSharp4: [0, 2, 3, 6, 7, 9, 10],     // Dorian #4
  PhrygianMajor: [0, 1, 4, 5, 7, 8, 10],    // Phrygian Major
  LydianSharp2: [0, 3, 4, 6, 7, 9, 11],     // Lydian #2
  SuperLocrianFlat7: [0, 1, 3, 4, 6, 8, 9], // Super Locrian bb7
}

// Melodic minor modes
const MELODIC_MINOR_MODES = {
  MelodicMinor: [0, 2, 3, 5, 7, 9, 11],      // Melodic Minor
  DorianFlat2: [0, 1, 3, 5, 7, 9, 10],       // Dorian b2
  LydianAugmented: [0, 2, 4, 6, 8, 9, 11],   // Lydian Augmented
  LydianDominant: [0, 2, 4, 6, 7, 9, 10],    // Lydian Dominant
  MixolydianFlat6: [0, 2, 4, 5, 7, 8, 10],   // Mixolydian b6
  LocrianSharp2: [0, 2, 3, 5, 6, 8, 10],     // Locrian #2
  SuperLocrian: [0, 1, 3, 4, 6, 8, 10],      // Super Locrian
}

// Symmetric Scales
const SYMMETRIC_SCALES = {
  Diminished: [0, 2, 3, 5, 6, 8, 9, 11],      // Diminished (Half-Whole)
  WholeTone: [0, 2, 4, 6, 8, 10],             // Whole Tone
  Augmented: [0, 3, 4, 7, 8, 11],             // Augmented
  DiminishedWH: [0, 1, 3, 4, 6, 7, 9, 10]     // Diminished (Whole-Half)
}

export const scales: Scale[] = [
  // Major Scale and its modes
  {
    name: "Major (Ionian)",
    intervals: MAJOR_MODES.Ionian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Dorian",
    intervals: MAJOR_MODES.Dorian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Phrygian",
    intervals: MAJOR_MODES.Phrygian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Lydian",
    intervals: MAJOR_MODES.Lydian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Mixolydian",
    intervals: MAJOR_MODES.Mixolydian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Aeolian",
    intervals: MAJOR_MODES.Aeolian,
    category: "scale",
    parentScale: "Major"
  },
  {
    name: "Locrian",
    intervals: MAJOR_MODES.Locrian,
    category: "scale",
    parentScale: "Major"
  },

  // Harmonic Minor and its modes
  {
    name: "Harmonic Minor",
    intervals: HARMONIC_MINOR_MODES.HarmonicMinor,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Locrian ♯6",
    intervals: HARMONIC_MINOR_MODES.LocrianSharp6,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Ionian #5",
    intervals: HARMONIC_MINOR_MODES.IonianSharp5,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Dorian #4",
    intervals: HARMONIC_MINOR_MODES.DorianSharp4,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Phrygian Major",
    intervals: HARMONIC_MINOR_MODES.PhrygianMajor,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Lydian #2",
    intervals: HARMONIC_MINOR_MODES.LydianSharp2,
    category: "scale",
    parentScale: "Harmonic Minor"
  },
  {
    name: "Super Locrian ♭7",
    intervals: HARMONIC_MINOR_MODES.SuperLocrianFlat7,
    category: "scale",
    parentScale: "Harmonic Minor"
  },

  // Melodic Minor and its modes
  {
    name: "Melodic Minor",
    intervals: MELODIC_MINOR_MODES.MelodicMinor,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Dorian ♭2",
    intervals: MELODIC_MINOR_MODES.DorianFlat2,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Lydian Augmented",
    intervals: MELODIC_MINOR_MODES.LydianAugmented,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Lydian Dominant",
    intervals: MELODIC_MINOR_MODES.LydianDominant,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Mixolydian ♭6",
    intervals: MELODIC_MINOR_MODES.MixolydianFlat6,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Locrian ♯2",
    intervals: MELODIC_MINOR_MODES.LocrianSharp2,
    category: "scale",
    parentScale: "Melodic Minor"
  },
  {
    name: "Super Locrian",
    intervals: MELODIC_MINOR_MODES.SuperLocrian,
    category: "scale",
    parentScale: "Melodic Minor"
  },

  // Symmetric Scales
  {
    name: "Diminished (Half-Whole)",
    intervals: SYMMETRIC_SCALES.Diminished,
    category: "scale",
    parentScale: "Symmetric"
  },
  {
    name: "Diminished (Whole-Half)",
    intervals: SYMMETRIC_SCALES.DiminishedWH,
    category: "scale",
    parentScale: "Symmetric"
  },
  {
    name: "Whole Tone",
    intervals: SYMMETRIC_SCALES.WholeTone,
    category: "scale",
    parentScale: "Symmetric"
  },
  {
    name: "Augmented",
    intervals: SYMMETRIC_SCALES.Augmented,
    category: "scale",
    parentScale: "Symmetric"
  },

  // Other scales
  {
    name: "Pentatonic Major",
    intervals: [0, 2, 4, 7, 9],
    category: "scale",
    parentScale: "Pentatonic"
  },
  {
    name: "Pentatonic Minor",
    intervals: [0, 3, 5, 7, 10],
    category: "scale",
    parentScale: "Pentatonic"
  },
  {
    name: "Blues",
    intervals: [0, 3, 5, 6, 7, 10],
    category: "scale",
    parentScale: "Blues"
  }
]

export const chords: Chord[] = [
  // Major Chords
  {
    name: "Major",
    intervals: [0, 4, 7],
    category: "chord",
    parentGroup: "Major"
  },
  {
    name: "Major 7",
    intervals: [0, 4, 7, 11],
    category: "chord",
    parentGroup: "Major"
  },
  {
    name: "6",
    intervals: [0, 4, 7, 9],
    category: "chord",
    parentGroup: "Major"
  },
  {
    name: "6/9",
    intervals: [0, 4, 7, 9, 14],
    category: "chord",
    parentGroup: "Major"
  },
  {
    name: "Add 9",
    intervals: [0, 4, 7, 14],
    category: "chord",
    parentGroup: "Major"
  },

  // Minor Chords
  {
    name: "Minor",
    intervals: [0, 3, 7],
    category: "chord",
    parentGroup: "Minor"
  },
  {
    name: "Minor 7",
    intervals: [0, 3, 7, 10],
    category: "chord",
    parentGroup: "Minor"
  },
  {
    name: "Minor 6",
    intervals: [0, 3, 7, 9],
    category: "chord",
    parentGroup: "Minor"
  },
  {
    name: "Minor/Major 7",
    intervals: [0, 3, 7, 11],
    category: "chord",
    parentGroup: "Minor"
  },
  {
    name: "Minor 7♭5",
    intervals: [0, 3, 6, 10],
    category: "chord",
    parentGroup: "Minor"
  },
  {
    name: "Minor 9",
    intervals: [0, 3, 7, 10, 14],
    category: "chord",
    parentGroup: "Minor"
  },

  // Seventh Chords
  {
    name: "Dominant 7",
    intervals: [0, 4, 7, 10],
    category: "chord",
    parentGroup: "Seventh"
  },
  {
    name: "7/9",
    intervals: [0, 4, 7, 10, 14],
    category: "chord",
    parentGroup: "Seventh"
  },
  {
    name: "13",
    intervals: [0, 4, 7, 10, 21],
    category: "chord",
    parentGroup: "Seventh"
  },
  {
    name: "7#5",
    intervals: [0, 4, 8, 10],
    category: "chord",
    parentGroup: "Seventh"
  },
  {
    name: "7♭5",
    intervals: [0, 4, 6, 10],
    category: "chord",
    parentGroup: "Seventh"
  },
  {
    name: "#5",
    intervals: [0, 4, 8],
    category: "chord",
    parentGroup: "Seventh"
  },

  // Augmented Chords
  {
    name: "Augmented",
    intervals: [0, 4, 8],
    category: "chord",
    parentGroup: "Augmented"
  },
  {
    name: "Augmented 7",
    intervals: [0, 4, 8, 10],
    category: "chord",
    parentGroup: "Augmented"
  },
  {
    name: "Augmented Major 7",
    intervals: [0, 4, 8, 11],
    category: "chord",
    parentGroup: "Augmented"
  },

  // Diminished Chords
  {
    name: "Diminished",
    intervals: [0, 3, 6],
    category: "chord",
    parentGroup: "Diminished"
  },
  {
    name: "Diminished 7",
    intervals: [0, 3, 6, 9],
    category: "chord",
    parentGroup: "Diminished"
  },
  {
    name: "Half Diminished",
    intervals: [0, 3, 6, 10],
    category: "chord",
    parentGroup: "Diminished"
  }
]

export function getAllItems() {
  return [...scales, ...chords]
}

export function getItemByName(name: string) {
  return getAllItems().find(item => item.name === name)
}