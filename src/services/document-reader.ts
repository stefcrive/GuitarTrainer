'use client'

import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { DocumentRegion, DocumentScore, LibraryDocument, MarkerCandidate } from '@/types/document'
import { parseMusicXml, readMusicXml } from '@/lib/document-score'
import { splitDocumentText } from '@/lib/document-markers'
import { readDocxText } from '@/lib/document-docx'

export interface DocumentReader {
  pages: number
  pdf?: PDFDocumentProxy
  image?: boolean
  sections?: string[]
  score?: DocumentScore
  render: (page: number, scale?: number) => Promise<HTMLCanvasElement>
  text: (page: number) => Promise<string>
  outline: () => Promise<MarkerCandidate[]>
  close: () => Promise<void>
}

export async function openDocument(entry: LibraryDocument): Promise<DocumentReader> {
  const file = await entry.handle.getFile()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(entry.format)) {
    const bitmap = await createImageBitmap(file)
    return { pages: 1, image: true, text: async () => '', outline: async () => [],
      async render() {
        const scale = Math.min(1, Math.sqrt(16_000_000 / (bitmap.width * bitmap.height)))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        return canvas
      }, close: async () => bitmap.close() }
  }
  if (entry.format === 'pdf') {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/document-assets/pdf.worker.min.mjs'
    const task = pdfjs.getDocument({ data: await file.arrayBuffer(), cMapUrl: '/document-assets/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/document-assets/standard_fonts/', wasmUrl: '/document-assets/wasm/' })
    task.onPassword = () => { void task.destroy() }
    let pdf: PDFDocumentProxy
    try { pdf = await task.promise } catch (error) { await task.destroy(); throw new Error(`Cannot open PDF: ${error instanceof Error ? error.message : 'Unreadable or password-protected file.'}`) }
    return {
      pages: pdf.numPages, pdf,
      async render(page, scale = 2) {
        const sheet = await pdf.getPage(page)
        let viewport = sheet.getViewport({ scale })
        if (viewport.width * viewport.height > 16_000_000) viewport = sheet.getViewport({ scale: scale * Math.sqrt(16_000_000 / (viewport.width * viewport.height)) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await sheet.render({ canvas, viewport }).promise
        return canvas
      },
      async text(page) {
        const content = await (await pdf.getPage(page)).getTextContent()
        const rows = new Map<number, { x: number; text: string }[]>()
        for (const item of content.items) {
          if (!('str' in item)) continue
          const y = Math.round(item.transform[5] / 3) * 3
          const row = rows.get(y) ?? []
          row.push({ x: item.transform[4], text: item.str }); rows.set(y, row)
        }
        return [...rows].sort((a, b) => b[0] - a[0]).map(([, row]) => row.sort((a, b) => a.x - b.x).map(item => item.text).join('  ')).join('\n')
      },
      async outline() {
        const result: MarkerCandidate[] = []
        const outline = await pdf.getOutline()
        async function walk(items: NonNullable<typeof outline>) {
          for (const item of items) {
            const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
            if (Array.isArray(dest) && dest[0] !== undefined) {
              try {
                const index = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0])
                if (index >= 0 && index < pdf.numPages) result.push({ title: item.title, page: index + 1, origin: 'outline' })
              } catch { /* A broken outline target must not prevent scanning the book. */ }
            }
            if (item.items?.length) await walk(item.items)
          }
        }
        if (outline) await walk(outline)
        return result
      },
      close: () => task.destroy()
    }
  }
  let text: string
  let score: DocumentScore | undefined
  if (entry.format === 'docx') {
    text = readDocxText(new Uint8Array(await file.arrayBuffer()))
  } else if (['xml', 'musicxml', 'mxl'].includes(entry.format)) {
    score = parseMusicXml(readMusicXml(new Uint8Array(await file.arrayBuffer())))
    text = file.name
  } else text = await file.text()
  const sections = splitDocumentText(text)
  return { pages: sections.length, sections, score, text: async page => sections[page - 1] ?? '', outline: async () => [],
    render: async () => { throw new Error('Image selection is available for PDFs. Select text for a text document.') }, close: async () => {} }
}

export function cropDocumentCanvas(canvas: HTMLCanvasElement, region?: DocumentRegion): HTMLCanvasElement {
  if (!region) return canvas
  const cropped = document.createElement('canvas')
  cropped.width = Math.max(1, Math.round(region.width * canvas.width)); cropped.height = Math.max(1, Math.round(region.height * canvas.height))
  cropped.getContext('2d')!.drawImage(canvas, region.x * canvas.width, region.y * canvas.height, region.width * canvas.width, region.height * canvas.height, 0, 0, cropped.width, cropped.height)
  return cropped
}

export async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to capture page.')), 'image/png'))
}
