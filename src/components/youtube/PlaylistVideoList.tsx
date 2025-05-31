'use client'

import { useState, useEffect } from 'react'
import { useYouTubeStore } from '@/stores/youtube-store'
import { fetchPlaylistData } from '@/services/youtube'
import { FavoriteButton } from '@/components/video/FavoriteButton'
import { VideoTitle } from '@/components/video/VideoTitle'
import { Video } from '@/types/video'
import { useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface PlaylistVideo {
  id: string
  title: string
  description?: string
  thumbnailUrl: string
}

function convertToVideo(playlistVideo: PlaylistVideo): Video {
  return {
    id: playlistVideo.id,
    type: 'youtube',
    title: playlistVideo.title
  }
}

interface PlaylistVideoListProps {
  onVideoSelect: (videoId: string) => void
}

export function PlaylistVideoList({ onVideoSelect }: PlaylistVideoListProps) {
  const { playlists, setCacheForPlaylist, videoCache } = useYouTubeStore()
  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set())
  const [videos, setVideos] = useState<Record<string, PlaylistVideo[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Record<string, string | null>>({})

  const togglePlaylist = (playlistId: string) => {
    setExpandedPlaylists(prev => {
      const next = new Set(prev)
      if (next.has(playlistId)) {
        next.delete(playlistId)
      } else {
        next.add(playlistId)
      }
      return next
    })
  }

  const loadPlaylistData = async (playlistId: string) => {
    if (!expandedPlaylists.has(playlistId) || videos[playlistId]) return

    setLoading(prev => ({ ...prev, [playlistId]: true }))
    setError(prev => ({ ...prev, [playlistId]: null }))
    
    try {
      const data = await fetchPlaylistData(playlistId)
      console.log('Fetched playlist data:', {
        id: data.id,
        title: data.title,
        videoCount: data.videos.length
      })

      // Convert videos to cache format
      const videosToCache = data.videos.map(video => ({
        ...video,
        playlistId
      }))

      // Cache the videos in the store
      setCacheForPlaylist(playlistId, videosToCache)
      setVideos(prev => ({ ...prev, [playlistId]: data.videos }))

      // Log the cached videos
      console.log('Videos cached in store:', {
        playlistId,
        cachedVideos: Object.keys(videoCache).length,
        videos: videosToCache.map(v => ({
          id: v.id,
          title: v.title
        }))
      })
    } catch (error) {
      if (error instanceof Error) {
        const errorMessage = error.message === 'YouTube API key not configured'
          ? 'YouTube API key not configured. Please add NEXT_PUBLIC_YOUTUBE_API_KEY to your environment variables.'
          : `Error loading playlist: ${error.message}`
        setError(prev => ({ ...prev, [playlistId]: errorMessage }))
      } else {
        setError(prev => ({ ...prev, [playlistId]: 'An unknown error occurred while loading the playlist' }))
      }
    } finally {
      setLoading(prev => ({ ...prev, [playlistId]: false }))
    }
  }

  useEffect(() => {
    Array.from(expandedPlaylists).forEach(loadPlaylistData)
  }, [expandedPlaylists])

  if (playlists.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          No playlists added yet. Add playlists in the settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {playlists.map(playlist => {
        const isExpanded = expandedPlaylists.has(playlist.id)
        const isLoading = loading[playlist.id]
        const playlistError = error[playlist.id]
        const playlistVideos = videos[playlist.id] || []

        return (
          <div key={playlist.id} className="space-y-2">
            <button
              onClick={() => togglePlaylist(playlist.id)}
              className="w-full flex items-center p-2 hover:bg-accent rounded text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              <span className="font-medium">{playlist.title}</span>
            </button>

            {isExpanded && (
              <div className="pl-6 space-y-2">
                {playlistError && (
                  <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                    <p className="text-sm text-destructive">{playlistError}</p>
                  </div>
                )}

                {isLoading ? (
                  <div className="text-center py-4">
                    <p>Loading videos...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {playlistVideos.map(video => {
                      const videoData = convertToVideo(video)
                      return (
                        <div
                          key={video.id}
                          className="flex items-center gap-3 p-2 hover:bg-secondary/50 rounded-lg transition-colors"
                        >
                          <button
                            onClick={() => onVideoSelect(video.id)}
                            className="flex-1 flex items-center gap-3 text-left"
                          >
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="w-32 aspect-video object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm mb-1">
                                <VideoTitle
                                  title={video.title}
                                  videoId={video.id}
                                  className="line-clamp-2"
                                />
                              </div>
                              {video.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {video.description}
                                </p>
                              )}
                            </div>
                          </button>
                          <FavoriteButton video={videoData} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}