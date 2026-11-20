'use client'

import { RelatedMaterialLinks } from '@/components/materials/MaterialLibrary'
import { materialFolderPath } from '@/lib/practice-material'
import { useEffect, useMemo } from 'react'
import { Bookmark, ChevronDown, ChevronRight, FileText, Folder, Music, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FavoriteButton } from '@/components/audio/FavoriteButton'
import { useDocumentLibraryStore } from '@/stores/document-library-store'
import type { LibraryDocument } from '@/types/document'
import type { AudioFile, AudioMetadata } from '@/types/audio'

export type BookLibraryEntry = { kind: 'document'; file: LibraryDocument } | { kind: 'audio'; file: AudioFile }
export interface LibraryEntryStatus { markers: boolean; transcription: boolean }
interface FolderNode { folders: Map<string, FolderNode>; entries: BookLibraryEntry[] }

export function DocumentFolderList({ entries, selected, selectedFolder, searching, root, rootKey, status, audioMetadata, onSelect, onFolderSelect }: {
  entries: BookLibraryEntry[]; selected?: string; selectedFolder?: string; searching: boolean; root: FileSystemDirectoryHandle; rootKey: string
  status: Record<string, LibraryEntryStatus>; audioMetadata: Record<string, AudioMetadata>
  onSelect: (entry: BookLibraryEntry) => void; onFolderSelect: (path: string) => void
}) {
  const { folders, setFolder, starred, toggleStar } = useDocumentLibraryStore()
  useEffect(() => {
    if (!searching) return
    const expanded = { ...useDocumentLibraryStore.getState().folders }
    for (const entry of entries) {
      const parts = materialFolderPath(entry.file.path).split('/').filter(Boolean)
      for (let index = 1; index <= parts.length; index++) expanded[`${rootKey}:${parts.slice(0, index).join('/')}/`] = true
    }
    useDocumentLibraryStore.setState({ folders: expanded })
  }, [entries, rootKey, searching])
  const tree = useMemo(() => {
    const root: FolderNode = { folders: new Map(), entries: [] }
    for (const entry of entries) {
      let node = root
      for (const name of materialFolderPath(entry.file.path).split('/').filter(Boolean)) {
        if (!node.folders.has(name)) node.folders.set(name, { folders: new Map(), entries: [] })
        node = node.folders.get(name)!
      }
      node.entries.push(entry)
    }
    return root
  }, [entries])
  function rows(node: FolderNode, prefix = '', depth = 0): React.ReactNode {
    return <>{[...node.folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, folder]) => {
      const path = `${prefix}${name}/`, key = `${rootKey}:${path}`
      const open = folders[key] ?? (searching || folder.folders.size > 0)
      return <div key={path}><div className={`flex h-8 items-center rounded text-xs ${selectedFolder === path ? 'bg-accent' : 'hover:bg-muted/50'}`} style={{ paddingLeft: 4 + Math.min(depth, 4) * 12 }}>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} aria-expanded={open} onClick={() => setFolder(key, !open)}>{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</Button>
        <button title={path} aria-pressed={selectedFolder === path} className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded pr-2 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onFolderSelect(path)}><Folder className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate">{name}</span></button>
      </div>{open && rows(folder, path, depth + 1)}</div>
    })}{node.entries.map(entry => {
      const { file } = entry, info = status[file.path], favorite = starred[`${rootKey}:${file.path}`]
      return <div key={file.path} className={`flex h-8 items-center gap-1 border-b pr-1 text-xs ${selected === file.path ? 'bg-accent' : info?.transcription ? 'bg-purple-500/10 hover:bg-purple-500/15' : 'hover:bg-muted/50'}`} style={{ paddingLeft: 10 + depth * 16 }}>
        <button title={file.path} aria-pressed={selected === file.path} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(entry)}>
          {entry.kind === 'audio' ? <Music className="h-3 w-3 shrink-0 text-purple-500" /> : <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}<span className="min-w-0 flex-1 truncate">{file.name}</span>
          {info?.transcription && <span className="shrink-0 text-purple-600 dark:text-purple-400" aria-label="Has transcription" title="Has transcription">T</span>}
          {info?.markers && <Bookmark className="h-3 w-3 shrink-0 text-blue-500" aria-label="Has markers" />}
          <span className="shrink-0 uppercase text-muted-foreground">{entry.kind === 'document' ? entry.file.format : 'Audio'}</span>
        </button>
        <RelatedMaterialLinks path={file.path} kind={entry.kind} root={root} />
        {entry.kind === 'audio' ? <FavoriteButton audio={entry.file} metadata={audioMetadata[file.path]} directoryHandle={root} /> : <Button variant="ghost" size="icon" className={`h-7 w-7 shrink-0 ${favorite ? 'text-yellow-500' : 'text-muted-foreground'}`} aria-label={`${favorite ? 'Unstar' : 'Star'} ${file.name}`} aria-pressed={Boolean(favorite)} onClick={() => toggleStar(`${rootKey}:${file.path}`)}><Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} /></Button>}
      </div>
    })}</>
  }
  return <nav aria-label="Document folders">{rows(tree)}</nav>
}
