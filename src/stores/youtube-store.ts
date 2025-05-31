import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface YouTubePlaylist {
  id: string
  title: string
  description?: string
}

interface YouTubeVideoCache {
  id: string
  title: string
  description?: string
  thumbnailUrl: string
  playlistId: string
}

import type { Video } from '@/types/video'
import type { FileSystemAudio } from '@/types/audio'

interface SearchResult {
  type: 'video' | 'audio'
  content: Video | FileSystemAudio
  matchingMarkers: Array<{
    id: string
    startTime: number
    endTime: number
    text?: string
    tags: string[]
  }>
}

interface YouTubeState {
  // Search state
  searchTerm: string
  selectedTags: string[]
  searchResults: SearchResult[]
  // Search actions
  setSearchTerm: (term: string) => void
  setSelectedTags: (tags: string[]) => void
  setSearchResults: (results: SearchResult[]) => void
  clearSearch: () => void
  // YouTube state
  playlists: YouTubePlaylist[]
  videoCache: Record<string, YouTubeVideoCache>
  isInitialized: boolean
  // YouTube actions
  addPlaylist: (playlist: YouTubePlaylist) => void
  removePlaylist: (id: string) => void
  cacheVideo: (video: YouTubeVideoCache) => void
  setCacheForPlaylist: (playlistId: string, videos: YouTubeVideoCache[]) => void
  setInitialized: (value: boolean) => void
}

export const useYouTubeStore = create<YouTubeState>()(
  persist(
    (set) => ({
      // Initialize search state
      searchTerm: '',
      selectedTags: [],
      searchResults: [],
      playlists: [],
      videoCache: {},
      isInitialized: false,
      // Search actions
      setSearchTerm: (term: string) => set(() => ({ searchTerm: term })),
      setSelectedTags: (tags: string[]) => set(() => ({ selectedTags: tags })),
      setSearchResults: (results: SearchResult[]) => set(() => ({ searchResults: results })),
      clearSearch: () => set(() => ({
        searchTerm: '',
        selectedTags: [],
        searchResults: []
      })),
      addPlaylist: (playlist) =>
        set((state) => ({
          playlists: [...state.playlists, playlist],
        })),
      removePlaylist: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
          videoCache: Object.fromEntries(
            Object.entries(state.videoCache).filter(
              ([_, video]) => video.playlistId !== id
            )
          ),
        })),
      cacheVideo: (video) =>
        set((state) => ({
          videoCache: {
            ...state.videoCache,
            [video.id]: video,
          },
        })),
      setCacheForPlaylist: (playlistId, videos) =>
        set((state) => ({
          videoCache: {
            ...state.videoCache,
            ...Object.fromEntries(
              videos.map((video) => [
                video.id,
                { ...video, playlistId },
              ])
            ),
          },
        })),
      setInitialized: (value) =>
        set(() => ({
          isInitialized: value,
        })),
    }),
    {
      name: 'youtube-storage',
      partialize: (state) => ({
        // Persist search state
        searchTerm: state.searchTerm,
        selectedTags: state.selectedTags,
        searchResults: state.searchResults,
        // Persist YouTube state
        playlists: state.playlists,
        videoCache: state.videoCache,
        isInitialized: state.isInitialized
      }),
      version: 1
    }
  )
)