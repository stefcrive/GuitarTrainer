'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BookOpen, Music, Video, X } from 'lucide-react'
import { useDirectoryStore } from '@/stores/directory-store'
import { buildMaterialIndex, materialKind, materialHref, skipMaterialEntry, type MaterialFile, type MaterialKind } from '@/lib/practice-material'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

const empty = buildMaterialIndex([])
const Context = createContext(empty)
export function MaterialLibraryProvider({ children }: { children: ReactNode }) {
  const { rootHandle, lastUpdate } = useDirectoryStore()
  const [catalog, setCatalog] = useState({ root: rootHandle, index: empty, error: '' })
  useEffect(() => {
    let cancelled = false
    if (!rootHandle) { setCatalog({ root: null, index: empty, error: '' }); return }
    const files: MaterialFile[] = []
    async function walk(directory: FileSystemDirectoryHandle, prefix = '') {
      for await (const [name, entry] of directory.entries()) {
        if (cancelled) return
        if (skipMaterialEntry(name)) continue
        const path = prefix ? `${prefix}/${name}` : name
        if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path)
        else { const kind = materialKind(name); if (kind) files.push({ path, name, kind }) }
      }
    }
    void walk(rootHandle).then(() => { if (!cancelled) setCatalog({ root: rootHandle, index: buildMaterialIndex(files), error: '' }) })
      .catch(error => { if (!cancelled) setCatalog({ root: rootHandle, index: empty, error: `Cannot index related material: ${error.message}` }) })
    return () => { cancelled = true }
  }, [rootHandle, lastUpdate])
  return <Context.Provider value={catalog.root === rootHandle ? catalog.index : empty}>{catalog.error && <div role="alert" className="p-2 text-xs text-destructive">{catalog.error}</div>}{children}</Context.Provider>
}

export function RelatedMaterialLinks({ path, kind, root, compact = true }: { path: string; kind: MaterialKind; root?: FileSystemDirectoryHandle; compact?: boolean }) {
  const index = useContext(Context)
  const primary = useDirectoryStore(state => state.rootHandle)
  const group = index.byPath.get(path)
  if (!group || (root && root !== primary)) return null
  return <span className="inline-flex shrink-0 items-center gap-0.5" onClick={event => event.stopPropagation()}>
    {(['document', 'audio', 'video'] as const).filter(target => target !== kind && group.files[target].length).map(target => {
      const files = group.files[target], Icon = { document: BookOpen, audio: Music, video: Video }[target]
      const label = `${files.length} related ${target === 'document' ? 'books / documents' : target} in ${group.path}. Grouped by course folder; exact references are not verified.`
      return <Tooltip key={target} label={label}><Link className="inline-flex h-7 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label} href={materialHref(target, group.path, files.length === 1 ? files[0].path : undefined)}><Icon className="h-3.5 w-3.5" />{!compact && <span className="tabular-nums">{files.length}</span>}</Link></Tooltip>
    })}
  </span>
}

export function MaterialFilter({ group, onClear }: { group: string | null; onClear: () => void }) {
  if (!group) return null
  return <div className="flex h-8 items-center gap-1 border-b px-2 text-xs"><span className="min-w-0 flex-1 truncate" title={group}>{group.split('/').pop()}</span><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Show all material" onClick={onClear}><X className="h-3.5 w-3.5" /></Button></div>
}
