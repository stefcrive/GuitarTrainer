'use client'

import type { MarkerCatalogItem } from '@/services/marker-catalog'
import { formatMarkerRange } from '@/components/learning/PracticeSession'

export function FolderMarkers({ path, items, onSelect }: { path: string; items: MarkerCatalogItem[]; onSelect: (item: MarkerCatalogItem) => void }) {
  return <section aria-label="Folder markers" className="flex min-h-0 max-h-64 shrink-0 flex-col border-t xl:max-h-none xl:w-96 xl:border-l xl:border-t-0">
    <div className="flex items-center gap-2 border-b px-2 py-2 text-xs font-medium"><span className="min-w-0 flex-1 truncate" title={path}>Markers: {path.replace(/\/$/, '').split('/').pop()}</span><span className="tabular-nums text-muted-foreground">{items.length}</span></div>
    <div className="min-h-0 overflow-auto custom-scrollbar">{items.length ? <table className="w-full table-fixed whitespace-nowrap text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left font-medium">Title</th><th className="w-24 px-2 py-1 text-left font-medium">Source</th><th className="w-24 px-2 py-1 text-right font-medium">Position</th></tr></thead><tbody>{items.map(item => <tr key={item.markerKey} className="border-t hover:bg-muted/50">
      <td className="px-2 py-1"><button className="block w-full truncate rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring" title={item.markerTitle} onClick={() => onSelect(item)}>{item.markerTitle}</button></td><td className="truncate px-2 py-1" title={item.sourceTitle}>{item.sourceTitle}</td><td className="px-2 py-1 text-right tabular-nums">{formatMarkerRange(item)}</td>
    </tr>)}</tbody></table> : <div className="p-3 text-xs text-muted-foreground">No markers in this folder.</div>}</div>
  </section>
}
