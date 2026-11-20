'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceNavigation'
import { MaterialFilter, RelatedMaterialLinks } from '@/components/materials/MaterialLibrary'
import { materialGroupPath, materialFolderPath } from '@/lib/practice-material'
import { Header } from '@/components/layout/Header'
import { AudioFolderList } from '@/components/audio/AudioFolderList'
import Link from 'next/link'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MetricBadge } from '@/components/ui/metric-badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { LibraryHeader } from '@/components/layout/LibraryHeader'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { AudioFile } from '@/types/audio'
import { fileSystemService } from '@/services/file-system'
import { getAllAudioMetadata, AUDIO_METADATA_UPDATED_EVENT } from '@/services/audio-metadata'
import { favoritesService, FAVORITES_UPDATED_EVENT } from '@/services/favorites'
import { Bookmark, List, Music } from 'lucide-react'

export default function AudioPage() { return <Suspense><AudioPageContent /></Suspense> }

function AudioPageContent() {
  type ListFilter = 'all' | 'markers' | 'favorites'
  const { audioRootHandle, rootHandle, scanVideoFolderForAudio, lastUpdate, expandToPath } = useDirectoryStore()
  const params = useWorkspaceSearchParams(), router = useRouter()
  const material = params.get('material')
  const audioPath = params.get('audio')
  const includePrimary = Boolean(rootHandle && (scanVideoFolderForAudio || !audioRootHandle || material || audioPath))
  const [sources, setSources] = useState<Map<AudioFile, FileSystemDirectoryHandle>>(new Map())
  const [mobileView, setMobileView] = useState<'library' | 'practice'>('library')
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [audioFilter, setAudioFilter] = useState<ListFilter>('all')
  const [audioMarkerPaths, setAudioMarkerPaths] = useState<Set<string>>(new Set())
  const [favoriteAudioPaths, setFavoriteAudioPaths] = useState<Set<string>>(new Set())
  const [filterRevision, setFilterRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scanError, setScanError] = useState('')
  const lastLoadedRootsRef = useRef<{
    audioRootHandle: FileSystemDirectoryHandle | null
    rootHandle: FileSystemDirectoryHandle | null
    scanVideoFolderForAudio: boolean
  }>({
    audioRootHandle: null,
    rootHandle: null,
    scanVideoFolderForAudio: false
  })
  
  // Use global media store instead of local state
  const {
    audio: { selectedAudio, searchQuery },
    setSelectedAudio,
    setAudioSearchQuery
  } = useMediaStore()

  useEffect(() => {
    let cancelled = false
    async function loadAudioFiles() {
      setLoading(true); setScanError('')
      try {
        const files: AudioFile[] = []
        const nextSources = new Map<AudioFile, FileSystemDirectoryHandle>()
        const previousRoots = lastLoadedRootsRef.current

        if (audioRootHandle && !material && !audioPath) {
          const audioRootChanged = previousRoots.audioRootHandle !== audioRootHandle
          const audioFiles = audioRootChanged
            ? fileSystemService.getCachedAudioFiles(audioRootHandle) ?? await fileSystemService.scanForAudioFiles(audioRootHandle)
            : await fileSystemService.scanForAudioFiles(audioRootHandle)
          for (const item of audioFiles) { const file = { ...item, sourceRootName: audioRootHandle.name }; files.push(file); nextSources.set(file, audioRootHandle) }
        }

        if (includePrimary && rootHandle && (audioRootHandle !== rootHandle || material || audioPath)) {
          const videoRootChanged = previousRoots.rootHandle !== rootHandle
            || previousRoots.scanVideoFolderForAudio !== scanVideoFolderForAudio
          const videoFolderAudioFiles = videoRootChanged
            ? fileSystemService.getCachedAudioFiles(rootHandle) ?? await fileSystemService.scanForAudioFiles(rootHandle)
            : await fileSystemService.scanForAudioFiles(rootHandle)
          for (const item of videoFolderAudioFiles) { const file = { ...item, sourceRootName: rootHandle.name }; files.push(file); nextSources.set(file, rootHandle) }
        }

        if (cancelled) return
        lastLoadedRootsRef.current = {
          audioRootHandle,
          rootHandle,
          scanVideoFolderForAudio
        }

        const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path))
        setSources(nextSources)
        setAudioFiles(sortedFiles)
      } catch (error) {
        if (!cancelled) setScanError(error instanceof Error ? error.message : 'Unable to scan audio files')
      }
      if (!cancelled) setLoading(false)
    }

    void loadAudioFiles()
    return () => { cancelled = true }
  }, [audioRootHandle, rootHandle, scanVideoFolderForAudio, includePrimary, material, audioPath, lastUpdate])

  useEffect(() => {
    const handleFavoritesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail
      if (!detail || detail.kind === 'audio') {
        setFilterRevision((prev) => prev + 1)
      }
    }
    const handleAudioMetadataUpdated = () => {
      setFilterRevision((prev) => prev + 1)
    }
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener)
    window.addEventListener(AUDIO_METADATA_UPDATED_EVENT, handleAudioMetadataUpdated as EventListener)
    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener)
      window.removeEventListener(AUDIO_METADATA_UPDATED_EVENT, handleAudioMetadataUpdated as EventListener)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const loadFilterData = async () => {
      try {
        const metadataPromises: Promise<Record<string, { markers?: unknown[] }>>[] = []
        if (audioRootHandle) {
          metadataPromises.push(getAllAudioMetadata(audioRootHandle))
        }
        if (includePrimary && rootHandle && rootHandle !== audioRootHandle) {
          metadataPromises.push(getAllAudioMetadata(rootHandle))
        }

        const [favoriteAudio, ...metadataSets] = await Promise.all([
          favoritesService.getAudioFavorites(),
          ...metadataPromises
        ])
        if (isCancelled) return

        const markerPaths = new Set<string>()
        for (const metadataSet of metadataSets) {
          for (const [path, metadata] of Object.entries(metadataSet)) {
            if (Array.isArray(metadata.markers) && metadata.markers.length > 0) {
              markerPaths.add(path)
            }
          }
        }

        setAudioMarkerPaths(markerPaths)
        setFavoriteAudioPaths(new Set(favoriteAudio.map((favorite) => favorite.path)))
      } catch (filterDataError) {
        console.error('Error loading audio filter data:', filterDataError)
      }
    }
    loadFilterData()
    return () => {
      isCancelled = true
    }
  }, [audioRootHandle, rootHandle, includePrimary, audioFiles, filterRevision])

  useEffect(() => {
    if (!material && !audioPath) return
    setAudioSearchQuery(''); setAudioFilter('all')
    if (!audioPath) setMobileView('library')
    const folders = new Set(audioFiles.filter(file => materialGroupPath(file.path) === material || file.path === audioPath).map(file => materialFolderPath(file.path)))
    for (const folder of folders) expandToPath(folder + '/file')
    if (audioPath) {
      const file = audioFiles.find(file => file.path === audioPath)
      if (file) { setSelectedAudio(file); setMobileView('practice') }
    }
  }, [material, audioPath, audioFiles, expandToPath, setAudioSearchQuery, setSelectedAudio])
  const selectedSource = audioFiles.find(file => file.path === selectedAudio?.path && (!selectedAudio.sourceRootName || file.sourceRootName === selectedAudio.sourceRootName))
  const selectedRoot = selectedSource ? sources.get(selectedSource) : audioRootHandle ?? rootHandle

  const filteredAudioFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return audioFiles.filter((audio) => {
      if (material && materialGroupPath(audio.path) !== material) return false
      const matchesSearch = !query
        || audio.name.toLowerCase().includes(query)
        || audio.path.toLowerCase().includes(query)
      if (!matchesSearch) return false
      if (audioFilter === 'markers') return audioMarkerPaths.has(audio.path)
      if (audioFilter === 'favorites') return favoriteAudioPaths.has(audio.path)
      return true
    })
  }, [audioFiles, searchQuery, audioFilter, audioMarkerPaths, favoriteAudioPaths, material])

  if (!audioRootHandle && !rootHandle) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <EmptyState
            icon={Music}
            title="Select an audio directory"
            description="Audio files are available after an audio root is configured or video-folder scanning is enabled."
            action={
              <Button asChild>
                <Link href="/settings">Go to Settings</Link>
              </Button>
            }
          />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <WorkspaceLayout
          mobileView={mobileView}
          onMobileViewChange={setMobileView}
          defaultSidebarSize={35}
          sidebarLabel="Library"
          contentLabel="Player"
          sidebar={
            <div className="workspace-sidebar flex flex-col">
              <LibraryHeader
                title="Audio Library"
                icon={Music}
                searchValue={searchQuery}
                searchPlaceholder="Search audio files..."
                onSearchChange={setAudioSearchQuery}
                controls={
                  <SegmentedControl
                    size="sm"
                    className="w-full"
                    value={audioFilter}
                    onValueChange={setAudioFilter}
                    options={[
                      { value: 'all', label: 'All', icon: List },
                      { value: 'markers', label: 'Markers', icon: Bookmark },
                      { value: 'favorites', label: 'Favorites', icon: Bookmark }
                    ]}
                  />
                }
                metrics={<MetricBadge icon={Music} value={filteredAudioFiles.length} label="Audio" />}
              />
              {scanError && <div role="alert" className="p-2 text-xs text-destructive">{scanError}</div>}
              <MaterialFilter group={material} onClear={() => router.push('/audio?material=')} />
              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1 custom-scrollbar">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-8 rounded-md bg-accent/35" />
                    ))}
                  </div>
                ) : filteredAudioFiles.length === 0 ? (
                  <EmptyState
                    icon={Music}
                    title={searchQuery ? 'No audio files match your search' : 'No audio files found'}
                    description={
                      searchQuery
                        ? 'Try a different title or path.'
                        : audioFilter === 'all'
                          ? 'Add audio files to one of the selected directories.'
                          : `No audio files match the ${audioFilter === 'markers' ? 'Markers' : 'Favorites'} filter.`
                    }
                  />
                ) : (
                  <>{Array.from(new Set(sources.values())).map((source, index) => <AudioFolderList key={index}
                    audioFiles={filteredAudioFiles.filter(file => sources.get(file) === source)}
                    selectedAudio={selectedAudio}
                    onAudioSelect={file => { setSelectedAudio(file); setMobileView('practice') }}
                    directoryHandle={source}
                  />)}</>
                )}
              </div>
            </div>
          }
        >
          <div className="workspace-content overflow-y-auto p-3 md:p-4 custom-scrollbar">
            {selectedAudio && selectedRoot && <div className="flex justify-end"><RelatedMaterialLinks compact={false} path={selectedAudio.path} kind="audio" root={selectedRoot} /></div>}
            {selectedAudio ? (
              <AudioPlayer audioFile={selectedAudio} directoryHandle={selectedRoot ?? undefined} />
            ) : (
              <EmptyState icon={Music} title="Select an audio file" description="Choose a track from the library to start practicing." />
            )}
          </div>
        </WorkspaceLayout>
      </main>
    </div>
  )
}
