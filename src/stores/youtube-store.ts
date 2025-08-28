import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { savePlaylistsToFolder, loadPlaylistsFromFolder } from '@/services/playlist-storage'

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
  addPlaylist: (playlist: YouTubePlaylist, rootHandle?: FileSystemDirectoryHandle) => void
  removePlaylist: (id: string, rootHandle?: FileSystemDirectoryHandle) => void
  cacheVideo: (video: YouTubeVideoCache) => void
  setCacheForPlaylist: (playlistId: string, videos: YouTubeVideoCache[]) => void
  setInitialized: (value: boolean) => void
  // Folder sync actions
  loadPlaylistsFromFolder: (rootHandle: FileSystemDirectoryHandle) => Promise<void>
  syncPlaylistsToFolder: (rootHandle: FileSystemDirectoryHandle) => Promise<void>
  clearPlaylists: () => void
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
      addPlaylist: async (playlist, rootHandle) => {
        set((state) => ({
          playlists: [...state.playlists, playlist],
        }))
        
        if (rootHandle) {
          try {
            const currentState = useYouTubeStore.getState()
            await savePlaylistsToFolder(rootHandle, currentState.playlists)
          } catch (error) {
            console.error('Failed to save playlists to folder:', error)
          }
        }
      },
      removePlaylist: async (id, rootHandle) => {
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
          videoCache: Object.fromEntries(
            Object.entries(state.videoCache).filter(
              ([_, video]) => video.playlistId !== id
            )
          ),
        }))
        
        if (rootHandle) {
          try {
            const currentState = useYouTubeStore.getState()
            await savePlaylistsToFolder(rootHandle, currentState.playlists)
          } catch (error) {
            console.error('Failed to save playlists to folder:', error)
          }
        }
      },
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
      loadPlaylistsFromFolder: async (rootHandle) => {
        try {
          const playlists = await loadPlaylistsFromFolder(rootHandle)
          set({ playlists, isInitialized: true })
        } catch (error) {
          console.error('Failed to load playlists from folder:', error)
          set({ isInitialized: true })
        }
      },
      syncPlaylistsToFolder: async (rootHandle) => {
        try {
          const currentState = useYouTubeStore.getState()
          await savePlaylistsToFolder(rootHandle, currentState.playlists)
        } catch (error) {
          console.error('Failed to sync playlists to folder:', error)
        }
      },
      clearPlaylists: () => {
        set({ playlists: [], isInitialized: false })
      },
    }),
    {
      name: 'youtube-storage',
      partialize: (state) => ({
        // Persist search state
        searchTerm: state.searchTerm,
        selectedTags: state.selectedTags,
        searchResults: state.searchResults,
        // Don't persist playlists - they should be folder-specific
        videoCache: state.videoCache,
        isInitialized: state.isInitialized
      }),
      version: 1
    }
  )
)