'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { PlaylistVideoList } from '@/components/youtube/PlaylistVideoList'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { YouTubeInitializer } from '@/components/youtube/YouTubeInitializer'
import { FavoriteButton } from '@/components/video/FavoriteButton'
import { Input } from '@/components/ui/input'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useYouTubeStore } from '@/stores/youtube-store'
import { useMediaStore } from '@/stores/media-store'
import { Search } from 'lucide-react'
import type { YouTubeVideo, VideoPlayerControls } from '@/types/video'

export default function YoutubePage() {
  const [playerControls, setPlayerControls] = useState<VideoPlayerControls | null>(null)
  const { videoCache } = useYouTubeStore()
  
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

  const handleVideoSelect = (videoId: string) => {
    setSelectedYouTubeVideo(videoId)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ResizablePanelGroup direction="horizontal" className="min-h-screen">
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full border-r bg-muted/30">
              <div className="p-4 space-y-4">
                <h2 className="text-xl font-semibold">YouTube Playlists</h2>
                
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search playlists and videos..."
                    value={searchQuery}
                    onChange={(e) => setYouTubeSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                  <PlaylistVideoList onVideoSelect={handleVideoSelect} />
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={70}>
            <div className="p-4">
              {selectedVideoId ? (
                <div className="space-y-4">
                  {/* Action buttons */}
                  <div className="flex justify-between items-center">
                    <div>
                      <FavoriteButton
                        video={{
                          type: 'youtube' as const,
                          id: selectedVideoId
                        } satisfies YouTubeVideo}
                      />
                    </div>
                    <div></div>
                  </div>

                  <div className="relative">
                    <YouTubeInitializer>
                      <YouTubePlayer
                        videoId={selectedVideoId}
                        onControlsReady={setPlayerControls}
                        className="w-full rounded overflow-hidden"
                      />
                    </YouTubeInitializer>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a video from the playlist to start watching
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}