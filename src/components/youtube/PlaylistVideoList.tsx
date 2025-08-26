'use client'

import { useState, useEffect } from 'react'
import { useYouTubeStore } from '@/stores/youtube-store'
import { useMediaStore } from '@/stores/media-store'
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
  const {
    youtube: { expandedPlaylists, selectedVideoId },
    toggleYouTubePlaylist,
    setYouTubeExpandedPlaylists
  } = useMediaStore()
  const [videos, setVideos] = useState<Record<string, PlaylistVideo[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Record<string, string | null>>({})
  
  // Convert array to Set for easier checking
  const expandedPlaylistsSet = new Set(expandedPlaylists || [])

  const togglePlaylist = (playlistId: string) => {
    toggleYouTubePlaylist(playlistId)
  }

  const loadPlaylistData = async (playlistId: string) => {
    // Check if videos are already in local state
    if (videos[playlistId]) return
    
    // Check if we already have videos for this playlist in the cache
    const cachedVideosForPlaylist = Object.values(videoCache)
      .filter(video => video.playlistId === playlistId)
    
    // If we have cached videos for this playlist, use them instead of fetching
    if (cachedVideosForPlaylist.length > 0) {
      setVideos(prev => ({
        ...prev,
        [playlistId]: cachedVideosForPlaylist.map(video => ({
          id: video.id,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl
        }))
      }))
      return
    }

    setLoading(prev => ({ ...prev, [playlistId]: true }))
    setError(prev => ({ ...prev, [playlistId]: null }))
    
    try {
      const data = await fetchPlaylistData(playlistId)
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Fetched playlist data:', {
          id: data.id,
          title: data.title,
          videoCount: data.videos.length
        })
      }

      // Convert videos to cache format
      const videosToCache = data.videos.map(video => ({
        ...video,
        playlistId
      }))

      // Cache the videos in the store
      setCacheForPlaylist(playlistId, videosToCache)
      setVideos(prev => ({ ...prev, [playlistId]: data.videos }))
      
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Videos cached in store:', {
          playlistId,
          cachedVideos: Object.keys(videoCache).length,
          videos: videosToCache.length // Just log the count instead of the full array
        })
      }
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

  // Load data for expanded playlists
  useEffect(() => {
    if (expandedPlaylists && Array.isArray(expandedPlaylists)) {
      // Use a Set to deduplicate playlist IDs
      const uniquePlaylistIds = new Set(expandedPlaylists);
      uniquePlaylistIds.forEach(playlistId => {
        if (!videos[playlistId] && !loading[playlistId]) {
          loadPlaylistData(playlistId);
        }
      });
    }
  }, [expandedPlaylists]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand playlist that contains selected video - with optimizations
  useEffect(() => {
    // Only run this effect if we have a selected video and playlists
    if (!selectedVideoId || playlists.length === 0) return;
    
    // Check if the video is in the cache first
    const cachedVideo = videoCache[selectedVideoId];
    
    if (cachedVideo) {
      // We already know which playlist this video belongs to
      const playlistId = cachedVideo.playlistId;
      
      // Only update expanded playlists if needed
      if (!expandedPlaylistsSet.has(playlistId)) {
        const updatedExpanded = [...(expandedPlaylists || []), playlistId];
        setYouTubeExpandedPlaylists(updatedExpanded);
      }
      return;
    }
    
    // If not in cache, check loaded videos
    let playlistFound = false;
    
    // Check if the video is in any loaded playlists
    for (const [playlistId, playlistVideos] of Object.entries(videos)) {
      if (playlistVideos.some(video => video.id === selectedVideoId)) {
        // Video found in this playlist, make sure it's expanded
        if (!expandedPlaylistsSet.has(playlistId)) {
          const updatedExpanded = [...(expandedPlaylists || []), playlistId];
          setYouTubeExpandedPlaylists(updatedExpanded);
        }
        playlistFound = true;
        break; // Exit the loop once found
      }
    }
    
    // If not found and we have playlists that aren't loaded yet, load them one at a time
    if (!playlistFound) {
      // Find the first unloaded playlist
      const unloadedPlaylist = playlists.find(playlist => !videos[playlist.id] && !loading[playlist.id]);
      if (unloadedPlaylist) {
        loadPlaylistData(unloadedPlaylist.id);
      }
    }
  }, [selectedVideoId, playlists.length, Object.keys(videos).length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const isExpanded = expandedPlaylistsSet.has(playlist.id)
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
                      const isSelected = selectedVideoId === video.id
                      return (
                        <div
                          key={video.id}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/50'
                          }`}
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