'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { FavoriteButton } from '@/components/video/FavoriteButton'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { useYouTubeStore } from '@/stores/youtube-store'
import { recentlyViewedService } from '@/services/recently-viewed'
import type { VideoPlayerControls } from '@/types/video'
import { EmptyState } from '@/components/ui/empty-state'
import { Youtube } from 'lucide-react'

interface PageProps {
  params: {
    videoId: string
  }
}

export default function YouTubeVideoPage({ params }: PageProps) {
  return (
    <Suspense fallback={<YouTubeVideoFallback />}>
      <YouTubeVideoPageContent params={params} />
    </Suspense>
  )
}

function YouTubeVideoFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <EmptyState icon={Youtube} title="Loading YouTube video" description="Preparing the player." />
      </main>
    </div>
  )
}

function YouTubeVideoPageContent({ params }: PageProps) {
  const searchParams = useSearchParams()
  const markerId = searchParams.get('marker')
  const { markerState, setMarkerState } = useVideoMarkers(`youtube:${params.videoId}`)
  const { videoCache } = useYouTubeStore()
  const video = videoCache[params.videoId]

  // Add to recently viewed when video starts playing
  useEffect(() => {
    if (video) {
      recentlyViewedService.addRecentVideo({
        type: 'youtube',
        id: params.videoId,
        title: video.title
      })
    }
  }, [params.videoId, video])

  const handleControlsReady = (controls: VideoPlayerControls) => {
    // If a marker ID is provided, seek to that marker's position
    if (markerId && markerState) {
      const marker = markerState.markers.find(m => m.id === markerId)
      if (marker) {
        controls.seek(marker.startTime)
      }
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {video && (
            <h2 className="text-xl font-semibold truncate">
              {video.title || 'Untitled Video'}
            </h2>
          )}
          <div className="relative">
            <YouTubePlayer
              videoId={params.videoId}
              onControlsReady={handleControlsReady}
              className="w-full rounded overflow-hidden"
            />
            <div className="absolute top-4 right-4">
              <FavoriteButton
                video={{
                  type: 'youtube' as const,
                  id: params.videoId
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
