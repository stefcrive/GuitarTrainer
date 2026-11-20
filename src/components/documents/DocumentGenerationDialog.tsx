'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { DocumentDialog } from './DocumentDialog'

export interface DocumentGenerationOptions { from: number; to: number; offset: number; ocr: boolean; music: boolean }
export function DocumentGenerationDialog({ pages, pdf, onGenerate, onClose }: { pages: number; pdf: boolean; onGenerate: (options: DocumentGenerationOptions) => void; onClose: () => void }) {
  const [options, setOptions] = useState<DocumentGenerationOptions>({ from: 1, to: pages, offset: 0, ocr: true, music: true })
  return <DocumentDialog title="Generate document markers" onClose={onClose}>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); onGenerate(options) }}>
      <div className="grid grid-cols-3 gap-2"><label className="text-xs">From page<Input type="number" min={1} max={pages} value={options.from} onChange={event => setOptions({ ...options, from: Number(event.target.value) })} required /></label>
        <label className="text-xs">Through page<Input type="number" min={options.from} max={pages} value={options.to} onChange={event => setOptions({ ...options, to: Number(event.target.value) })} required /></label>
        <label className="text-xs">Index offset<Input type="number" value={options.offset} onChange={event => setOptions({ ...options, offset: Number(event.target.value) })} required /></label></div>
      <div className="flex items-center gap-1 text-xs">Outlines, index entries, and headings<MarkerHelp label="Candidates are reviewed before saving. Index offset converts printed page numbers to PDF pages: if printed page 1 is PDF page 7, enter 6. Text documents use numbered sections." /></div>
      {pdf && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options.ocr} onChange={event => setOptions({ ...options, ocr: event.target.checked })} />OCR pages without text<MarkerHelp label="PaddleOCR runs locally. Whole-book OCR may take several minutes; cancel keeps candidates already found for review." /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options.music} onChange={event => setOptions({ ...options, music: event.target.checked })} />Find notation and TAB regions<MarkerHelp label="Finds straight five-line and six-line staff systems. Each region becomes a candidate with a Recognize button. Skewed scans and complex layouts may need manual selection." /></label></>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button type="submit" size="sm" disabled={!Number.isInteger(options.from) || !Number.isInteger(options.to) || options.from < 1 || options.to < options.from || options.to > pages}>Find markers</Button></div>
    </form>
  </DocumentDialog>
}
