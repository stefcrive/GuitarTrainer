'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocumentDialog } from './DocumentDialog'
import type { DocumentMarker } from '@/types/document'

export function DocumentMarkerReview({ candidates, onSave, onClose }: { candidates: DocumentMarker[]; onSave: (markers: DocumentMarker[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(new Set(candidates.map(marker => marker.id)))
  const [items, setItems] = useState(candidates)
  return <DocumentDialog title={`Review markers (${candidates.length})`} onClose={onClose} wide>
    <div className="max-h-[60vh] overflow-auto rounded-md border">
      <table className="w-full whitespace-nowrap text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2"><input aria-label="Select all candidates" type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={event => setSelected(new Set(event.target.checked ? items.map(item => item.id) : []))} /></th>{['Title', 'Page', 'Type', 'Source'].map(label => <th className="px-2 py-1 text-left" key={label}>{label}</th>)}</tr></thead>
        <tbody>{items.map(marker => <tr className="border-t" key={marker.id}><td className="px-2 py-1"><input type="checkbox" aria-label={`Include ${marker.title}`} checked={selected.has(marker.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(marker.id); else next.delete(marker.id); return next })} /></td>
          <td className="px-2 py-1"><input className="h-8 w-full min-w-48 rounded border bg-background px-2" aria-label="Candidate title" value={marker.title} onChange={event => setItems(items.map(item => item.id === marker.id ? { ...item, title: event.target.value } : item))} /></td>
          <td className="px-2 py-1 tabular-nums">{marker.page}</td><td className="px-2 py-1">{marker.kind}</td><td className="px-2 py-1">{marker.origin}</td></tr>)}</tbody></table>
    </div>
    <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!items.some(item => selected.has(item.id) && item.title.trim())} onClick={() => onSave(items.filter(item => selected.has(item.id) && item.title.trim()))}>Add {selected.size} markers</Button></div>
  </DocumentDialog>
}
