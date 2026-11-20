import { detectStaves } from '@/lib/document-staves'
import type { DocumentScore } from '@/types/document'
import { missingNotationStaves } from '@/lib/document-coverage'
import { canvasBlob, cropDocumentCanvas } from '@/services/document-reader'
import { combineDocumentScores } from '@/lib/document-score-timing'
import type { DocumentRegion } from '@/types/document'

// TAB bands delimit guitar systems, including systems with a vocal staff above the
// guitar staff. Keep those staves together so simultaneous parts stay simultaneous.
export function notationSystemRegions(source: HTMLCanvasElement): DocumentRegion[] {
  const staves = detectStaves(source.getContext('2d')!.getImageData(0, 0, source.width, source.height))
  if (!staves.some(staff => staff.kind === 'tab')) return []
  const regions: DocumentRegion[] = []
  let first: typeof staves[number] | undefined, last = first
  const flush = () => {
    if (!first || !last) return
    const top = Math.min(first.region.y, last.region.y)
    const bottom = Math.max(first.region.y + first.region.height, last.region.y + last.region.height)
    regions.push({ x: 0, y: top, width: 1, height: bottom - top })
    first = undefined; last = undefined
  }
  for (const staff of staves) {
    if (staff.kind === 'tab') flush()
    else { first ??= staff; last = staff }
  }
  flush()
  return regions
}

export async function recoverNotationSystems(source: HTMLCanvasElement, page: number, signal: AbortSignal, progress: (message: string) => void): Promise<DocumentScore[]> {
  const regions = notationSystemRegions(source)
  if (regions.length < 2) throw new Error('The complete opening system could not be recovered. Include its clef and all five staff lines.')
  const scores: DocumentScore[] = []
  for (const [index, region] of regions.entries()) {
    signal.throwIfAborted()
    progress(`Page ${page}: reading system ${index + 1} / ${regions.length} in printed order...`)
    const prepared = prepareNotation(cropDocumentCanvas(source, region), true, 28)
    const response = await fetch('/api/documents/recognize', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: await canvasBlob(prepared.canvas), signal })
    const result = await response.json()
    if (!response.ok || !result.scores?.length) throw new Error(`Page ${page}, system ${index + 1}: ${result.error || 'Not all notation was recognized. No later system has been substituted for it.'}`)
    for (const score of result.scores as DocumentScore[]) {
      const mapped = prepared.mapScore(score, page)
      if (prepared.missingStaves([score]).length) { mapped.coverageWarning = `System ${index + 1}: some staff positions are uncertain. Check the source or use GPT vision.`; mapped.warnings.push(mapped.coverageWarning) }
      const position = (p: NonNullable<DocumentScore['notes'][number]['position']>) => ({ ...p, x: region.x + p.x * region.width, y: region.y + p.y * region.height, height: p.height * region.height, system: `system-${index}:${p.system}` })
      scores.push({ ...mapped, notes: mapped.notes.map(note => ({ ...note, position: note.position && position(note.position) })), measures: mapped.measures.map(measure => ({ ...measure, position: measure.position && position(measure.position) })) })
    }
  }
  const combined = combineDocumentScores(scores)
  combined.warnings.push('Recovered complete guitar systems separately, in printed order. Check meter changes between systems.')
  return [combined]
}

// Keep the transform so Audiveris coordinates can be projected onto the original scan.
export function prepareNotation(source: HTMLCanvasElement, maskTabs = true, targetSpacing = 20) {
  const { width, height } = source
  const staves = detectStaves(source.getContext('2d')!.getImageData(0, 0, width, height))
  const notation = staves.filter(staff => staff.kind === 'notation')
  const gaps = notation.map(staff => (staff.lines[4] - staff.lines[0]) / 4).sort((a, b) => a - b)
  const gap = gaps[Math.floor(gaps.length / 2)] ?? 20
  const slope = notation[0]?.slope ?? staves[0]?.slope ?? 0
  const pad = Math.ceil(Math.max(2 * gap, Math.abs(slope * width / 2) + gap))
  const scale = Math.min(4, Math.max(0.5, targetSpacing / gap), Math.sqrt(15_500_000 / ((width + pad * 2) * (height + pad * 2))))
  const cleaned = document.createElement('canvas')
  cleaned.width = width; cleaned.height = height
  const clean = cleaned.getContext('2d')!
  clean.drawImage(source, 0, 0)
  clean.fillStyle = 'white'
  for (const staff of staves.filter(staff => maskTabs && staff.kind === 'tab')) {
    const spacing = (staff.lines[5] - staff.lines[0]) / 5
    const top = staff.lines[0] - spacing * 0.7, bottom = staff.lines[5] + spacing * 0.8
    clean.beginPath()
    clean.moveTo(0, top - staff.slope * width / 2)
    clean.lineTo(width, top + staff.slope * width / 2)
    clean.lineTo(width, bottom + staff.slope * width / 2)
    clean.lineTo(0, bottom - staff.slope * width / 2)
    clean.closePath(); clean.fill()
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((width + pad * 2) * scale)
  canvas.height = Math.ceil((height + pad * 2) * scale)
  const context = canvas.getContext('2d')!
  context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
  context.setTransform(scale, -slope * scale, 0, scale, pad * scale, (pad + slope * width / 2) * scale)
  context.drawImage(cleaned, 0, 0)
  context.resetTransform()
  return {
    missingStaves(scores: DocumentScore[]) { return missingNotationStaves(staves, scores.map(score => this.mapScore(score, 1)), height) },
    canvas, removedTabs: maskTabs ? staves.filter(staff => staff.kind === 'tab').length : 0,
    mapScore(score: DocumentScore, page: number): DocumentScore {
      const map = (position: NonNullable<DocumentScore['notes'][number]['position']>) => {
        const x = position.x * canvas.width / scale - pad
        const y = position.y * canvas.height / scale - pad + slope * (x - width / 2)
        return { ...position, page, x: Math.max(0, Math.min(1, x / width)), y: Math.max(0, Math.min(1, y / height)), height: position.height * canvas.height / scale / height }
      }
      return { ...score, notes: score.notes.map(note => ({ ...note, position: note.position && map(note.position) })),
        measures: score.measures.map(measure => ({ ...measure, position: measure.position && map(measure.position) })) }
    },
  }
}
