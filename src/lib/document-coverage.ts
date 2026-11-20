import type { DocumentScore } from '@/types/document'
import type { DetectedStaff } from './document-staves'

// A successful process exit does not mean that every printed staff was transcribed.
export function missingNotationStaves(staves: DetectedStaff[], scores: DocumentScore[], height: number): number[] {
  const notes = scores.flatMap(score => score.notes).filter(note => note.position)
  return staves.filter(staff => staff.kind === 'notation').flatMap((staff, index) => {
    const center = (staff.lines[0] + staff.lines[4]) / 2 / height
    const tolerance = (staff.lines[4] - staff.lines[0]) / height * 0.65
    return notes.some(note => Math.abs(note.position!.y + note.position!.height / 2 - center) < tolerance) ? [] : [index + 1]
  })
}
