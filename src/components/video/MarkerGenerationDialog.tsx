'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarkerHelp } from './MarkerGenerationSettings'
import { defaultMarkerOptions, type MarkerGenerationOptions } from '@/lib/marker-generation-options'

const presets = {
  lessons: { label: 'Lessons', help: 'Complete learning objectives, including explanations, examples, corrections, and practice instructions.', placeholder: 'For example: Keep each fretboard visualization exercise together, including slow demonstrations.' },
  repertoire: { label: 'Repertoire', help: 'Songs, sections, riffs, and phrases, with the full walkthrough and repetitions of each passage.', placeholder: 'For example: Separate verse, chorus, and solo walkthroughs; keep repetitions with their original passage.' },
  devices: { label: 'Musical devices', help: 'Reusable licks, motifs, rhythmic ideas, harmonic devices, and techniques, including their explanation and application.', placeholder: 'For example: Focus on outside-playing devices and explain how each resolves back to the harmony.' }
}

export function MarkerGenerationDialog({ open, onClose, onGenerate, youtube = false }: {
  open: boolean
  onClose: () => void
  onGenerate: (options: MarkerGenerationOptions) => void
  youtube?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [options, setOptions] = useState<MarkerGenerationOptions>({ ...defaultMarkerOptions })
  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) {
      element.showModal()
      element.querySelector('select')?.focus()
    }
    if (!open && element?.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={onClose} onClose={onClose}
      className="max-h-[85vh] w-[calc(100%-2rem)] max-w-md rounded-md border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/50">
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); onClose(); onGenerate({ ...options }) }}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${id}-title`} className="text-sm font-medium">Generate markers</h2>
          <MarkerHelp align="end" label="Saved transcripts are reused. Markers cover complete revisitable units, including intervening played examples. Changing segmentation does not transcribe again." />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor={`${id}-preset`} className="text-xs font-medium">Segmentation</label>
            <MarkerHelp label={presets[options.preset].help} />
          </div>
          <select id={`${id}-preset`} value={options.preset}
            onChange={event => setOptions(previous => ({ ...previous, preset: event.target.value as MarkerGenerationOptions['preset'] }))}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {Object.entries(presets).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-prompt`} className="text-xs font-medium">Custom instructions (optional)</label>
          <textarea id={`${id}-prompt`} rows={3} maxLength={4000} value={options.customPrompt}
            placeholder={presets[options.preset].placeholder}
            onChange={event => setOptions(previous => ({ ...previous, customPrompt: event.target.value }))}
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {!youtube && <div>
          <div className="flex items-center gap-1">
            <label htmlFor={`${id}-speed`} className="text-xs font-medium">First transcription</label>
            <MarkerHelp label="Used only when no saved transcript exists. Fast processes speech in batches with the same Whisper model; it uses more memory and can produce different wording. Standard keeps sequential decoding. Both preserve musical passages inside teaching units." />
          </div>
          <select id={`${id}-speed`} value={options.transcriptionMode}
            onChange={event => setOptions(previous => ({ ...previous, transcriptionMode: event.target.value as MarkerGenerationOptions['transcriptionMode'] }))}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="fast">Fast (batched)</option>
            <option value="standard">Standard</option>
          </select>
        </div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm">Generate markers</Button>
        </div>
      </form>
    </dialog>
  )
}
