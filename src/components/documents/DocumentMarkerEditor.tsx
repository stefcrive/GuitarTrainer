'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TagInput } from '@/components/ui/tag-input'
import { LearningDomainSelect } from '@/components/learning/LearningDomainSelect'
import { DocumentDialog } from './DocumentDialog'
import type { DocumentMarker } from '@/types/document'

export function DocumentMarkerEditor({ marker, pages, onSave, onClose }: { marker: DocumentMarker; pages: number; onSave: (marker: DocumentMarker) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(marker)
  const valid = draft.title.trim() && Number.isInteger(draft.page) && draft.page >= 1 && draft.endPage >= draft.page && draft.endPage <= pages
  return <DocumentDialog title="Document marker" onClose={onClose}>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (valid) onSave({ ...draft, title: draft.title.trim() }) }}>
      <label className="block text-xs">Title<Input autoFocus value={draft.title} maxLength={180} onChange={event => setDraft({ ...draft, title: event.target.value })} required /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs">From<Input type="number" min={1} max={pages} value={draft.page} onChange={event => setDraft({ ...draft, page: Number(event.target.value) })} /></label>
        <label className="text-xs">Through<Input type="number" min={draft.page} max={pages} value={draft.endPage} onChange={event => setDraft({ ...draft, endPage: Number(event.target.value) })} /></label>
        <label className="text-xs">Type<select className="h-9 w-full rounded-md border bg-background px-2" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as DocumentMarker['kind'] })}>
          <option value="section">Section</option><option value="notation">Notation</option><option value="tab">TAB</option><option value="note">Note</option>
        </select></label>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="text-xs">Learning type<LearningDomainSelect value={draft.learning?.domain} onChange={domain => setDraft({ ...draft, learning: { ...draft.learning, domain } })} /></div>
        <label className="text-xs">Progress %<Input type="number" min={0} max={100} value={draft.completionDegree} onChange={event => setDraft({ ...draft, completionDegree: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label>
      </div>
      <div className="text-xs">Tags<TagInput tags={draft.tags} onTagsChange={tags => setDraft({ ...draft, tags })} /></div>
      <label className="block text-xs">Notes<textarea value={draft.notes} rows={4} onChange={event => setDraft({ ...draft, notes: event.target.value })} className="mt-1 w-full rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      <div className="flex justify-end gap-2"><Button size="sm" type="button" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" type="submit" disabled={!valid}>Save marker</Button></div>
    </form>
  </DocumentDialog>
}
