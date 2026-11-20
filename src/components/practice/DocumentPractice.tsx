'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceNavigation'
import { MaterialFilter, RelatedMaterialLinks } from '@/components/materials/MaterialLibrary'
import { materialGroupPath, materialFolderPath } from '@/lib/practice-material'
import Link from 'next/link'
import { BookOpen, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { LibraryHeader } from '@/components/layout/LibraryHeader'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { MetricBadge } from '@/components/ui/metric-badge'
import { MarkerHelp } from '@/components/video/MarkerGenerationSettings'
import { DocumentFolderList, type BookLibraryEntry, type LibraryEntryStatus } from '@/components/documents/DocumentFolderList'
import { DocumentWorkspace } from '@/components/documents/DocumentWorkspace'
import { FolderMarkers } from '@/components/documents/FolderMarkers'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { useDirectoryStore } from '@/stores/directory-store'
import { useDocumentLibraryStore } from '@/stores/document-library-store'
import { loadDocumentLibrary, DOCUMENTS_UPDATED_EVENT } from '@/services/documents'
import { bookCatalogItem, type MarkerCatalogItem } from '@/services/marker-catalog'
import { fileSystemService } from '@/services/file-system'
import { getAllAudioMetadata, AUDIO_METADATA_UPDATED_EVENT } from '@/services/audio-metadata'
import { favoritesService, FAVORITES_UPDATED_EVENT } from '@/services/favorites'
import type { AudioMetadata } from '@/types/audio'
import type { DocumentState } from '@/types/document'

export default function DocumentsPage() { return <Suspense><DocumentsPageContent /></Suspense> }

function DocumentsPageContent() {
  const params = useWorkspaceSearchParams(), router = useRouter()
  const material = params.get('material'), documentPath = params.get('document')
  const { rootHandle, audioRootHandle, rootPath, audioRootPath, lastUpdate } = useDirectoryStore()
  const root = rootHandle ?? audioRootHandle
  const rootKey = (rootHandle ? rootPath : audioRootPath) ?? root?.name ?? ''
  const { showAudio, setShowAudio, filter, setFilter, starred } = useDocumentLibraryStore()
  const [entries, setEntries] = useState<BookLibraryEntry[]>([])
  const [states, setStates] = useState<Record<string, DocumentState | null>>({})
  const [audioMetadata, setAudioMetadata] = useState<Record<string, AudioMetadata>>({})
  const [audioStars, setAudioStars] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<BookLibraryEntry>()
  const [markerId, setMarkerId] = useState<string>()
  const [folder, setFolder] = useState<string>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [mobileView, setMobileView] = useState<'library' | 'practice'>('library')

  useEffect(() => {
    setSelected(undefined); setFolder(undefined); setMarkerId(undefined)
    setEntries([]); setStates({}); setAudioMetadata({}); setError('')
    if (!root) return
    const controller = new AbortController()
    setLoading(true)
    Promise.all([loadDocumentLibrary(root, controller.signal), fileSystemService.scanForAudioFiles(root), getAllAudioMetadata(root)])
      .then(([documents, audio, metadata]) => {
        if (controller.signal.aborted) return
        setEntries([...documents.map(({ entry }) => ({ kind: 'document' as const, file: entry })), ...audio.map(file => ({ kind: 'audio' as const, file }))].sort((a, b) => a.file.path.localeCompare(b.file.path)))
        setStates(Object.fromEntries(documents.map(({ entry, state }) => [entry.path, state])))
        setAudioMetadata(metadata)
      }).catch(error => { if (!controller.signal.aborted) setError(`Cannot scan library: ${error.message}`) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [root, lastUpdate, revision])

  useEffect(() => {
    let cancelled = false
    const loadStars = () => { void favoritesService.getAudioFavorites().then(items => { if (!cancelled) setAudioStars(new Set(items.map(item => item.path))) }).catch(error => { if (!cancelled) setError(`Cannot load stars: ${error.message}`) }) }
    const loadAudio = () => { if (root) void getAllAudioMetadata(root).then(metadata => { if (!cancelled) setAudioMetadata(metadata) }).catch(error => { if (!cancelled) setError(`Cannot refresh audio: ${error.message}`) }) }
    const loadDocument = (event: Event) => {
      const detail = (event as CustomEvent<{ root: FileSystemDirectoryHandle; path: string; state: DocumentState }>).detail
      if (detail.root === root) setStates(current => ({ ...current, [detail.path]: detail.state }))
    }
    loadStars()
    window.addEventListener(DOCUMENTS_UPDATED_EVENT, loadDocument)
    window.addEventListener(AUDIO_METADATA_UPDATED_EVENT, loadAudio)
    window.addEventListener(FAVORITES_UPDATED_EVENT, loadStars)
    return () => { cancelled = true; window.removeEventListener(DOCUMENTS_UPDATED_EVENT, loadDocument); window.removeEventListener(AUDIO_METADATA_UPDATED_EVENT, loadAudio); window.removeEventListener(FAVORITES_UPDATED_EVENT, loadStars) }
  }, [root])

  useEffect(() => {
    if (!material && !documentPath) return
    setQuery(''); setFilter('all'); setShowAudio(false)
    if (documentPath) {
      const entry = entries.find(entry => entry.kind === 'document' && entry.file.path === documentPath)
      if (entry) { setSelected(entry); setFolder(undefined); setMarkerId(undefined); setMobileView('practice') }
    }
  }, [material, documentPath, entries, setFilter, setShowAudio])

  const status = useMemo(() => Object.fromEntries(entries.map(entry => {
    const markers = states[entry.file.path]?.markers ?? []
    const metadata = audioMetadata[entry.file.path]
    return [entry.file.path, entry.kind === 'document' ? { markers: markers.length > 0, transcription: markers.some(marker => Boolean(marker.score)) } : { markers: Boolean(metadata?.markers?.length), transcription: Boolean(metadata?.annotations?.some(annotation => annotation.text.trim())) }]
  })) as Record<string, LibraryEntryStatus>, [entries, states, audioMetadata])
  const filtered = useMemo(() => entries.filter(entry => {
    const path = entry.file.path
    if (material && materialGroupPath(path) !== material) return false
    if (entry.kind === 'audio' && !showAudio || !path.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (filter === 'markers') return status[path]?.markers
    if (filter === 'transcriptions') return status[path]?.transcription
    if (filter === 'starred') return entry.kind === 'audio' ? audioStars.has(path) : starred[`${rootKey}:${path}`]
    return true
  }), [entries, showAudio, query, filter, status, audioStars, starred, rootKey, material])
  const folderMarkers = useMemo((): MarkerCatalogItem[] => {
    if (!folder || !root) return []
    return entries.filter(entry => (materialFolderPath(entry.file.path) + '/').startsWith(folder) && (showAudio || entry.kind === 'document')).flatMap(entry => {
      if (entry.kind === 'document') return (states[entry.file.path]?.markers ?? []).map(marker => bookCatalogItem(entry.file, marker, root))
      const metadata = audioMetadata[entry.file.path]
      return (metadata?.markers ?? []).map(marker => ({ markerKey: `${entry.file.path}::${marker.id}`, contentPath: entry.file.path, contentType: 'audio' as const, sourceTitle: entry.file.name, markerTitle: marker.title || metadata.annotations.find(annotation => annotation.markerId === marker.id)?.text || 'Audio marker', marker, tags: [], storage: { kind: 'audio-metadata' as const, handle: root } }))
    })
  }, [folder, root, entries, states, audioMetadata, showAudio])
  const selectMarker = (item: MarkerCatalogItem) => {
    const entry = entries.find(entry => entry.file.path === item.contentPath)
    if (entry) { setSelected(entry); setMarkerId(item.marker.id); setMobileView('practice') }
  }
  const markersPanel = folder ? <FolderMarkers path={folder} items={folderMarkers} onSelect={selectMarker} /> : undefined
  return <div className="flex h-screen flex-col"><Header /><main className="min-h-0 flex-1 overflow-hidden">
    {!root ? <div className="flex items-center gap-3 p-4 text-sm"><BookOpen className="h-5 w-5" /><span>Select a root directory for books.</span><Button size="sm" asChild><Link href="/settings">Settings</Link></Button></div> :
      <WorkspaceLayout sidebarLabel="Books" contentLabel="Document" defaultSidebarSize={35} mobileView={mobileView} onMobileViewChange={setMobileView} sidebar={<div className="workspace-sidebar flex flex-col">
        <LibraryHeader title="Books & Documents" icon={BookOpen} searchValue={query} onSearchChange={setQuery} searchPlaceholder="Search books and audio..." controls={<div className="space-y-1">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Library filters">{(['all', 'markers', 'transcriptions', 'starred'] as const).map(value => <Button key={value} size="sm" className="h-7 px-2 text-xs" variant={filter === value ? 'secondary' : 'ghost'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'markers' ? 'With markers' : value === 'transcriptions' ? 'Transcriptions' : 'Starred'}</Button>)}</div>
          <div className="flex items-center gap-1 text-xs"><label className="flex h-7 items-center gap-2"><input type="checkbox" checked={showAudio} onChange={event => setShowAudio(event.target.checked)} />Show audio</label><MarkerHelp label="Show companion audio in the same root as your books. Transcriptions include saved notation/TAB scores and audio with written annotations." /></div>
        </div>} metrics={<><MetricBadge icon={BookOpen} value={filtered.length} label="Items" /><Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Refresh documents" disabled={loading} onClick={() => { setRevision(revision + 1); useDirectoryStore.getState().refreshVideoList() }}><RefreshCw className="h-3 w-3" /></Button></>} />
        <MaterialFilter group={material} onClear={() => router.push('/documents?material=')} />
        {error && <div role="alert" className="p-2 text-xs text-destructive">{error}</div>}
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">{loading ? <div role="status" className="p-3 text-xs">Scanning library...</div> : filtered.length === 0 ? <div className="p-3 text-xs text-muted-foreground">No items match these filters.</div> :
          <DocumentFolderList entries={filtered} selected={selected?.file.path} selectedFolder={folder} searching={Boolean(material || query.trim()) || filter !== 'all'} root={root} rootKey={rootKey} status={status} audioMetadata={audioMetadata} onFolderSelect={path => { setFolder(path); setMobileView('practice') }} onSelect={entry => { setSelected(entry); setMarkerId(undefined); setFolder(undefined); setMobileView('practice') }} />}</div>
      </div>}><div className="workspace-content flex flex-col">{selected && <div className="flex shrink-0 justify-end border-b px-2"><RelatedMaterialLinks compact={false} path={selected.file.path} kind={selected.kind} root={root} /></div>}<div className="min-h-0 flex-1">{selected?.kind === 'document' ? <DocumentWorkspace key={`${selected.file.path}:${markerId ?? ''}`} entry={selected.file} root={root} initialMarkerId={markerId} markersPanel={markersPanel} /> : <div className="flex h-full min-h-0 flex-col xl:flex-row"><div className="min-h-0 min-w-0 flex-1 overflow-auto">{selected?.kind === 'audio' ? <AudioPlayer key={selected.file.path} audioFile={selected.file} directoryHandle={root} selectedMarkerId={markerId} onMarkerSelect={id => setMarkerId(id ?? undefined)} /> : <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" />Select a book, audio file, or folder marker.</div>}</div>{markersPanel}</div>}</div></div></WorkspaceLayout>}
  </main></div>
}
