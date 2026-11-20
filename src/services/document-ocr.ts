'use client'

import type { OcrResultItem } from '@paddleocr/paddleocr-js'
import type { DocumentScore } from '@/types/document'
import { detectStaves } from '@/lib/document-staves'
import { emptyScore, STANDARD_TUNING } from '@/lib/document-score'

export async function createDocumentOcr(signal: AbortSignal) {
  // Keep ONNX/OpenCV's module workers out of Next 14's legacy worker minifier.
  const sdkUrl = '/document-assets/paddle.mjs'
  const { PaddleOCR }: typeof import('@paddleocr/paddleocr-js') = await import(/* webpackIgnore: true */ sdkUrl)
  signal.throwIfAborted()
  const worker = new Worker('/document-assets/ocr-worker.js', { type: 'module' })
  let rejectAbort: (error: Error) => void = () => {}
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
  const onAbort = () => { worker.terminate(); rejectAbort(new DOMException('OCR cancelled', 'AbortError')) }
  signal.addEventListener('abort', onAbort, { once: true })
  let engine: Awaited<ReturnType<typeof PaddleOCR.create>>
  try {
    engine = await Promise.race([PaddleOCR.create({ worker: { createWorker: () => worker },
      textDetectionModelName: 'PP-OCRv6_small_det', textRecognitionModelName: 'PP-OCRv6_small_rec',
      textDetectionModelAsset: { url: new URL('/document-assets/PP-OCRv6_small_det.tar', location.origin).href },
      textRecognitionModelAsset: { url: new URL('/document-assets/PP-OCRv6_small_rec.tar', location.origin).href },
      ortOptions: { backend: 'wasm', wasmPaths: new URL('/document-assets/ort/', location.origin).href, numThreads: 1 }
    }), aborted])
  } catch (error) { signal.removeEventListener('abort', onAbort); worker.terminate(); throw error }
  return {
    async recognize(image: HTMLCanvasElement, sparseDigits = false): Promise<OcrResultItem[]> {
      signal.throwIfAborted()
      const [result] = await Promise.race([engine.predict(image, { textDetLimitSideLen: 1600, textDetLimitType: 'max', textRecScoreThresh: sparseDigits ? 0.15 : 0.35,
        ...(sparseDigits ? { textDetThresh: 0.1, textDetBoxThresh: 0.1, textDetUnclipRatio: 2 } : {}) }), aborted])
      return result.items
    },
    dispose() { signal.removeEventListener('abort', onAbort); worker.terminate() }
  }
}

export function ocrText(items: OcrResultItem[]): string {
  const rows: { y: number; height: number; items: { x: number; text: string }[] }[] = []
  for (const item of [...items].sort((a, b) => a.poly[0][1] - b.poly[0][1])) {
    const ys = item.poly.map(point => point[1]), xs = item.poly.map(point => point[0])
    const y = (Math.min(...ys) + Math.max(...ys)) / 2, height = Math.max(...ys) - Math.min(...ys)
    let row = rows.find(row => Math.abs(row.y - y) < Math.max(row.height, height) * 0.6)
    if (!row) { row = { y, height, items: [] }; rows.push(row) }
    row.items.push({ x: Math.min(...xs), text: item.text })
  }
  return rows.map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join('  ')).join('\n')
}

export async function recognizeTab(canvas: HTMLCanvasElement, ocr: Awaited<ReturnType<typeof createDocumentOcr>>): Promise<DocumentScore> {
  const staves = detectStaves(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)).filter(staff => staff.kind === 'tab')
  if (!staves.length) throw new Error('No six-line TAB staff found. Include all six strings in the selection, or enter the notes manually.')
  const score = emptyScore('tab-ocr')
  let offset = 0
  for (const staff of staves) {
    const gap = (staff.lines[5] - staff.lines[0]) / 5
    const events: { x: number; string: number; fret: number }[] = []
    for (let string = 0; string < 6; string++) {
      const strip = document.createElement('canvas')
      const padding = 18
      strip.width = canvas.width * 2; strip.height = Math.ceil(gap * 1.6) + padding * 2
      const context = strip.getContext('2d')!
      context.fillStyle = 'white'; context.fillRect(0, 0, strip.width, strip.height)
      context.save()
      context.scale(2, 2)
      context.beginPath(); context.rect(0, padding / 2, strip.width / 2, gap * 0.8); context.clip()
      context.transform(1, -staff.slope, 0, 1, 0, -staff.lines[string] + gap * 0.4 + staff.slope * canvas.width / 2 + padding / 2)
      context.drawImage(canvas, 0, 0)
      context.restore()
      // Erase only long horizontal runs; preserve ordinary short digit strokes.
      const pixels = context.getImageData(0, 0, strip.width, strip.height)
      for (let y = 0; y < strip.height; y++) {
        let dark = 0
        for (let x = 0; x < strip.width; x++) if (pixels.data[(y * strip.width + x) * 4] < 120) dark++
        if (dark <= strip.width * 0.5) continue
        for (let x = 0; x < strip.width; x++) {
          const index = (y * strip.width + x) * 4
          pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255
        }
      }
      context.putImageData(pixels, 0, 0)
      const items = await ocr.recognize(strip, true)
      for (const item of items) {
        const digits = item.text.trim()
        if (!/^[\d\s|:-]+$/.test(digits)) continue
        const left = Math.min(...item.poly.map(point => point[0])), right = Math.max(...item.poly.map(point => point[0]))
        // A recognizer can return a whole row as one box. Preserve its columns
        // approximately, then require review rather than invent rhythmic certainty.
        for (const match of digits.matchAll(/\d{1,2}/g)) {
          if (Number(match[0]) > 24) continue
          const fraction = (match.index! + match[0].length / 2) / digits.length
          events.push({ x: (left + fraction * (right - left)) / 2, string: string + 1, fret: Number(match[0]) })
        }
      }
    }
    const columns: number[] = []
    for (const event of events.sort((a, b) => a.x - b.x)) {
      let column = columns.findIndex(x => Math.abs(x - event.x) < gap * 0.6)
      if (column < 0) { column = columns.length; columns.push(event.x) }
      score.notes.push({ id: crypto.randomUUID(), start: offset + column, duration: 1, midi: STANDARD_TUNING[event.string - 1] + event.fret, string: event.string, fret: event.fret })
    }
    offset += columns.length
  }
  if (!score.notes.length) throw new Error('TAB strings were detected but no fret numbers were readable. Use a clearer scan or enter notes manually.')
  score.warnings = ['Experimental TAB OCR: verify every fret and string. Standard EADGBE tuning is assumed.', 'Rhythm and meter are unknown. Quarter-note spacing is only a draft; correct the timing before confirming.']
  return score
}
