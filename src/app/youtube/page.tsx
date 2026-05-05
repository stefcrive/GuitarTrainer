'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { PlaylistVideoList } from '@/components/youtube/PlaylistVideoList'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { LibraryHeader } from '@/components/layout/LibraryHeader'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useYouTubeStore } from '@/stores/youtube-store'
import { useMediaStore } from '@/stores/media-store'
import { useDirectoryStore } from '@/stores/directory-store'
import { favoritesService, FAVORITES_UPDATED_EVENT } from '@/services/favorites'
import { markersService, MARKERS_UPDATED_EVENT } from '@/services/markers'
import { Bookmark, List, Youtube } from 'lucide-react'
import type { YouTubeVideo, VideoPlayerControls } from '@/types/video'

export default function YoutubePage() {
  type ListFilter = 'all' | 'markers' | 'favorites'
  const [playerControls, setPlayerControls] = useState<VideoPlayerControls | null>(null)
  const [videoFilter, setVideoFilter] = useState<ListFilter>('all')
  const [markerVideoIds, setMarkerVideoIds] = useState<Set<string>>(new Set())
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<string>>(new Set())
  const [filterRevision, setFilterRevision] = useState(0)
  const [mobileWorkspaceView, setMobileWorkspaceView] = useState<'library' | 'practice'>('library')
  const { videoCache } = useYouTubeStore()
  const { rootHandle } = useDirectoryStore()
  
  // Use global media store instead of local state
  const {
    youtube: { selectedVideoId, searchQuery },
    setSelectedYouTubeVideo,
    setYouTubeSearchQuery
  } = useMediaStore()
  
  const { markerState, setMarkerState } = useVideoMarkers(selectedVideoId ? `youtube:${selectedVideoId}` : '')

  // Add to recently viewed when video is selected
  useEffect(() => {
    if (selectedVideoId) {
      const video = videoCache[selectedVideoId]
      recentlyViewedService.addRecentVideo({
        type: 'youtube',
        id: selectedVideoId,
        title: video?.title
      })
    }
  }, [selectedVideoId, videoCache])

  useEffect(() => {
    const handleFavoritesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail
      if (!detail || detail.kind === 'video') {
        setFilterRevision((prev) => prev + 1)
      }
    }
    const handleMarkersUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ contentType?: string }>).detail
      if (!detail || detail.contentType === 'youtube') {
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
        const [favorites, youtubeMarkers] = await Promise.all([
          favoritesService.getVideoFavorites(),
          rootHandle ? markersService.loadAllMarkers(rootHandle, 'youtube') : Promise.resolve([])
        ])
        if (isCancelled) return

        const nextFavoriteIds = new Set(
          favorites
            .filter((favorite) => favorite.type === 'youtube')
            .map((favorite) => favorite.id)
        )
        const nextMarkerIds = new Set(
          youtubeMarkers
            .filter((record) => record.markerState.markers.length > 0)
            .map((record) => record.contentPath.replace(/^youtube:/, ''))
        )

        setFavoriteVideoIds(nextFavoriteIds)
        setMarkerVideoIds(nextMarkerIds)
      } catch (filterDataError) {
        console.error('Error loading YouTube filter data:', filterDataError)
      }
    }

    loadFilterData()
    return () => {
      isCancelled = true
    }
  }, [rootHandle, filterRevision])

  const handleVideoSelect = (videoId: string) => {
    setSelectedYouTubeVideo(videoId)
    setMobileWorkspaceView('practice')
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <WorkspaceLayout
          sidebarLabel="Playlists"
          contentLabel="Player"
          mobileView={mobileWorkspaceView}
          onMobileViewChange={setMobileWorkspaceView}
          sidebar={
            <div className="workspace-sidebar flex flex-col">
              <LibraryHeader
                title="YouTube Playlists"
                icon={Youtube}
                searchValue={searchQuery}
                searchPlaceholder="Search playlists and videos..."
                onSearchChange={setYouTubeSearchQuery}
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
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
                <PlaylistVideoList
                  onVideoSelect={handleVideoSelect}
                  filter={videoFilter}
                  markerVideoIds={markerVideoIds}
                  favoriteVideoIds={favoriteVideoIds}
                />
              </div>
            </div>
          }
        >
          <div className="workspace-content overflow-y-auto p-3 md:p-4 custom-scrollbar">
            {selectedVideoId ? (
              <YouTubePlayer
                videoId={selectedVideoId}
                onControlsReady={setPlayerControls}
                className="w-full overflow-hidden rounded-md"
              />
            ) : (
              <EmptyState icon={Youtube} title="Select a YouTube lesson" description="Choose a video from a playlist to start watching." />
            )}
          </div>
        </WorkspaceLayout>
      </main>
    </div>
  )
}
