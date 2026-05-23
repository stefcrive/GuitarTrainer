'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { VideoFolderList } from '@/components/video/VideoFolderList'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MetricBadge } from '@/components/ui/metric-badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { StatusBanner } from '@/components/ui/status-banner'
import type { VideoFile } from '@/services/file-system'
import type { VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { Header } from '@/components/layout/Header'
import { LibraryHeader } from '@/components/layout/LibraryHeader'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { favoritesService, FAVORITES_UPDATED_EVENT } from '@/services/favorites'
import { markersService, MARKERS_UPDATED_EVENT } from '@/services/markers'
import { Bookmark, List, Video as VideoIcon } from 'lucide-react'
import Link from 'next/link'

async function getFileHandle(rootHandle: FileSystemDirectoryHandle, path: string) {
  const segments = path.split('/')
  let currentHandle: FileSystemDirectoryHandle = rootHandle

  try {
    for (let i = 0; i < segments.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(segments[i])
      if (!currentHandle) {
        throw new Error(`Directory not found: ${segments[i]}`)
      }
    }

    const fileName = segments[segments.length - 1]
    const fileHandle = await currentHandle.getFileHandle(fileName)
    if (!fileHandle) {
      throw new Error(`File not found: ${fileName}`)
    }

    return fileHandle
  } catch (err) {
    console.error('Error traversing path:', err)
    throw new Error(`Error accessing file: ${path}`)
  }
}

export default function VideosPage() {
  return (
    <Suspense fallback={<VideosPageFallback />}>
      <VideosPageContent />
    </Suspense>
  )
}

function VideosPageFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <EmptyState icon={VideoIcon} title="Loading videos" description="Preparing the video workspace." />
      </main>
    </div>
  )
}

function VideosPageContent() {
  type ListFilter = 'all' | 'markers' | 'favorites'
  const searchParams = useSearchParams()
  const videoPath = searchParams.get('video')
  const markerId = searchParams.get('marker')

  const [videos, setVideos] = useState<VideoFile[]>([])
  const [videoFilter, setVideoFilter] = useState<ListFilter>('all')
  const [videoMarkerPaths, setVideoMarkerPaths] = useState<Set<string>>(new Set())
  const [favoriteVideoPaths, setFavoriteVideoPaths] = useState<Set<string>>(new Set())
  const [filterRevision, setFilterRevision] = useState(0)
  const { rootHandle, lastUpdate, expandToPath } = useDirectoryStore()
  const [error, setError] = useState<string | null>(null)
  const lastLoadedRootRef = useRef<FileSystemDirectoryHandle | null>(null)
  
  // Use global media store instead of local state
  const {
    video: { selectedVideo, videoFile, searchQuery, videoLoadError },
    setSelectedVideo,
    setVideoFile,
    setVideoSearchQuery,
    setVideoLoadError
  } = useMediaStore()

  const { markerState } = useVideoMarkers(selectedVideo?.path ?? '', videoFile)
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)

  // Load video from URL parameters
  useEffect(() => {
    if (rootHandle && videoPath) {
      // Find the video in the list that matches the path
      Promise.resolve(fileSystemService.getCachedVideos(rootHandle) ?? fileSystemService.scanForVideos(rootHandle))
        .then(videos => {
          const video = videos.find(v => v.path === videoPath)
          if (video) {
            // Expand folders to the video path when loading from URL
            expandToPath(video.path)
            loadVideo(video)
          }
        })
        .catch(console.error)
    }
  }, [rootHandle, videoPath])

  // Restore video file when page loads if there's a selected video but no file
  useEffect(() => {
    if (selectedVideo && !videoFile && rootHandle) {
      loadVideo(selectedVideo)
    }
  }, [selectedVideo, videoFile, rootHandle])

  useEffect(() => {
    if (rootHandle) {
      const rootChanged = lastLoadedRootRef.current !== rootHandle
      lastLoadedRootRef.current = rootHandle

      const cachedVideos = rootChanged ? fileSystemService.getCachedVideos(rootHandle) : null
      if (cachedVideos) {
        setVideos(cachedVideos)
        setError(null)
        return
      }

      fileSystemService.scanForVideos(rootHandle)
        .then(videos => {
          setVideos(videos)
          setError(null)
        })
        .catch((error: Error) => {
          console.error('Error loading videos:', error)
          setError('Error loading videos from directory')
        })
    } else {
      lastLoadedRootRef.current = null
      setVideos([])
    }
  }, [rootHandle, lastUpdate])

  useEffect(() => {
    const handleFavoritesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail
      if (!detail || detail.kind === 'video') {
        setFilterRevision((prev) => prev + 1)
      }
    }
    const handleMarkersUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ contentType?: string }>).detail
      if (!detail || detail.contentType === 'local') {
        setFilterRevision((prev) => prev + 1)
      }
    }
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener)
    window.addEventListener(MARKERS_UPDATED_EVENT, handleMarkersUpdated as EventListener)
    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener)
      window.removeEventListener(MARKERS_UPDATED_EVENT, handleMarkersUpdated as EventListener)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const loadFilterData = async () => {
      try {
        const [favoriteVideos, markerRecords] = await Promise.all([
          favoritesService.getVideoFavorites(),
          rootHandle ? markersService.loadAllMarkers(rootHandle, 'local') : Promise.resolve([])
        ])
        if (isCancelled) return

        const favoritePaths = new Set(
          favoriteVideos.flatMap((favorite) => (
            favorite.type === 'file' && typeof favorite.path === 'string' ? [favorite.path] : []
          ))
        )
        const markerPaths = new Set(
          markerRecords
            .filter((record) => record.markerState.markers.length > 0)
            .map((record) => record.contentPath)
        )

        setFavoriteVideoPaths(favoritePaths)
        setVideoMarkerPaths(markerPaths)
      } catch (filterDataError) {
        console.error('Error loading video filter data:', filterDataError)
      }
    }
    loadFilterData()
    return () => {
      isCancelled = true
    }
  }, [rootHandle, videos, lastUpdate, filterRevision])

  const filteredVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return videos.filter((video) => {
      const matchesSearch = !query
        || video.name.toLowerCase().includes(query)
        || video.path.toLowerCase().includes(query)
      if (!matchesSearch) return false
      if (videoFilter === 'markers') return videoMarkerPaths.has(video.path)
      if (videoFilter === 'favorites') return favoriteVideoPaths.has(video.path)
      return true
    })
  }, [videos, searchQuery, videoFilter, videoMarkerPaths, favoriteVideoPaths])

  const loadVideo = async (video: VideoFile) => {
    setSelectedVideo(video)
    setVideoFile(null)
    setVideoLoadError(null)

    try {
      if (!rootHandle) {
        throw new Error('No root directory selected')
      }

      const fileHandle = await getFileHandle(rootHandle, video.path)
      const file = await fileHandle.getFile()
      setVideoFile(file)

      // Mark video as viewed when loaded
      await recentlyViewedService.addRecentVideo(video, rootHandle)
    } catch (err) {
      console.error('Error loading video:', err)
      setVideoLoadError(err instanceof Error ? err.message : 'Error loading video')
      setVideoFile(null)
    }
  }

  if (!rootHandle) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <EmptyState
            icon={VideoIcon}
            title="Select a video root directory"
            description="Local videos are available after a root directory is configured in Settings."
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
          sidebarLabel="Library"
          contentLabel="Player"
          sidebar={
            <div className="workspace-sidebar flex flex-col">
              <LibraryHeader
                title="Video Library"
                icon={VideoIcon}
                searchValue={searchQuery}
                searchPlaceholder="Search videos..."
                onSearchChange={setVideoSearchQuery}
                controls={
                  <SegmentedControl
                    size="sm"
                    className="w-full"
                    value={videoFilter}
                    onValueChange={setVideoFilter}
                    options={[
                      { value: 'all', label: 'All', icon: List },
                      { value: 'markers', label: 'Markers', icon: Bookmark },
                      { value: 'favorites', label: 'Favorites', icon: Bookmark }
                    ]}
                  />
                }
                metrics={<MetricBadge icon={VideoIcon} value={filteredVideos.length} label="Videos" />}
              />
              {error && (
                <div className="p-3">
                  <StatusBanner tone="destructive">{error}</StatusBanner>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
                {filteredVideos.length > 0 ? (
                  <VideoFolderList
                    videos={filteredVideos}
                    selectedVideo={selectedVideo}
                    onVideoSelect={loadVideo}
                    directoryHandle={rootHandle}
                  />
                ) : (
                  <EmptyState
                    icon={VideoIcon}
                    title={searchQuery ? 'No videos match your search' : 'No videos found'}
                    description={
                      searchQuery
                        ? 'Try a different title or path.'
                        : videoFilter === 'all'
                          ? 'The selected directory does not contain supported video files.'
                          : `No videos match the ${videoFilter === 'markers' ? 'Markers' : 'Favorites'} filter.`
                    }
                  />
                )}
              </div>
            </div>
          }
        >
          <div className="workspace-content overflow-y-auto p-3 md:p-4 custom-scrollbar">
            {videoLoadError && (
              <StatusBanner tone="destructive" className="mb-4">
                {videoLoadError}
              </StatusBanner>
            )}
            {selectedVideo ? (
              <VideoPlayer
                videoFile={videoFile}
                video={selectedVideo}
                directoryHandle={rootHandle}
                className="w-full"
                onControlsReady={(controls) => {
                  setVideoControls(controls)
                  if (markerId && markerState) {
                    const marker = markerState.markers.find(m => m.id === markerId)
                    if (marker) {
                      controls.seek(marker.startTime)
                    }
                  }
                }}
                onPrevVideo={() => {
                  const currentIndex = videos.findIndex(v => v.path === selectedVideo.path)
                  if (currentIndex > 0) {
                    loadVideo(videos[currentIndex - 1])
                  }
                }}
                onNextVideo={() => {
                  const currentIndex = videos.findIndex(v => v.path === selectedVideo.path)
                  if (currentIndex < videos.length - 1) {
                    loadVideo(videos[currentIndex + 1])
                  }
                }}
              />
            ) : (
              <EmptyState icon={VideoIcon} title="Select a video" description="Choose a file from the library to start practicing." />
            )}
          </div>
        </WorkspaceLayout>
      </main>
    </div>
  )
}
