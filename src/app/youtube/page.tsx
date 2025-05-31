'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { PlaylistVideoList } from '@/components/youtube/PlaylistVideoList'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { YouTubeInitializer } from '@/components/youtube/YouTubeInitializer'
import { FavoriteButton } from '@/components/video/FavoriteButton'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useYouTubeStore } from '@/stores/youtube-store'
import type { YouTubeVideo, VideoPlayerControls } from '@/types/video'

export default function YoutubePage() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [playerControls, setPlayerControls] = useState<VideoPlayerControls | null>(null)
  const { markerState, setMarkerState } = useVideoMarkers(selectedVideoId ? `youtube:${selectedVideoId}` : '')
  const { videoCache } = useYouTubeStore()

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

  const handleVideoSelect = (videoId: string) => {
    setSelectedVideoId(videoId)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex">
        {/* Left sidebar */}
        <div className="w-[400px] border-r p-4 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4">YouTube Playlists</h2>
          <PlaylistVideoList onVideoSelect={handleVideoSelect} />
        </div>

        {/* Main content */}
        <div className="flex-1 p-6">
          {selectedVideoId ? (
            <div className="space-y-4">
              <div className="relative">
                <YouTubeInitializer>
                  <YouTubePlayer
                    videoId={selectedVideoId}
                    onControlsReady={setPlayerControls}
                    className="w-full rounded overflow-hidden"
                  />
                </YouTubeInitializer>
                <div className="absolute top-4 right-4">
                  <FavoriteButton
                    video={{
                      type: 'youtube' as const,
                      id: selectedVideoId
                    } satisfies YouTubeVideo}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a video from the playlist to start watching
            </div>
          )}
        </div>
      </main>
    </div>
  )
}