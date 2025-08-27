import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VideoFile } from '@/services/file-system'
import type { AudioFile } from '@/types/audio'
import type { YouTubeVideo } from '@/types/video'

// Types for markers filtering and sorting
type ContentType = 'local' | 'youtube' | 'audio'
type CompletionRange = 'all' | '0-25' | '26-50' | '51-75' | '76-100'
type SortOrder = 'date' | 'name' | 'completion'
type SortDirection = 'asc' | 'desc'

interface MediaPlayerState {
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  volume: number
}

interface VideoState {
  selectedVideo: VideoFile | null
  videoFile: File | null
  searchQuery: string
  playerState: MediaPlayerState
  videoLoadError: string | null
}

interface AudioState {
  selectedAudio: AudioFile | null
  searchQuery: string
  playerState: MediaPlayerState
}

interface YouTubeState {
  selectedVideoId: string | null
  searchQuery: string
  playerState: MediaPlayerState
  expandedPlaylists: string[]
}

interface MarkersState {
  selectedContentPath: string | null
  selectedFile: string | null
  searchQuery: string
  selectedTags: string[]
  selectedTypes: ContentType[]
  completionFilter: CompletionRange
  sortOrder: SortOrder
  sortDirection: SortDirection
}

interface RecentState {
  selectedVideo: VideoFile | null
  videoFile: File | null
  searchQuery: string
  playerState: MediaPlayerState
}

interface FavoritesState {
  selectedVideo: VideoFile | null
  selectedAudio: AudioFile | null
  videoFile: File | null
  searchQuery: string
  playerState: MediaPlayerState
}

interface MediaState {
  // Videos page state
  video: VideoState
  
  // Audio page state
  audio: AudioState
  
  // YouTube page state
  youtube: YouTubeState
  
  // Markers page state
  markers: MarkersState
  
  // Recent page state
  recent: RecentState
  
  // Favorites page state
  favorites: FavoritesState
  
  // Actions for video
  setSelectedVideo: (video: VideoFile | null) => void
  setVideoFile: (file: File | null) => void
  setVideoSearchQuery: (query: string) => void
  setVideoPlayerState: (state: Partial<MediaPlayerState>) => void
  setVideoLoadError: (error: string | null) => void
  clearVideoState: () => void
  
  // Actions for audio
  setSelectedAudio: (audio: AudioFile | null) => void
  setAudioSearchQuery: (query: string) => void
  setAudioPlayerState: (state: Partial<MediaPlayerState>) => void
  clearAudioState: () => void
  
  // Actions for YouTube
  setSelectedYouTubeVideo: (videoId: string | null) => void
  setYouTubeSearchQuery: (query: string) => void
  setYouTubePlayerState: (state: Partial<MediaPlayerState>) => void
  setYouTubeExpandedPlaylists: (playlists: string[]) => void
  toggleYouTubePlaylist: (playlistId: string) => void
  clearYouTubeState: () => void
  
  // Actions for markers
  setMarkersSelectedContent: (path: string | null) => void
  setMarkersSelectedFile: (file: string | null) => void
  setMarkersSearchQuery: (query: string) => void
  setMarkersSelectedTags: (tags: string[]) => void
  setMarkersSelectedTypes: (types: ContentType[]) => void
  setMarkersCompletionFilter: (filter: CompletionRange) => void
  setMarkersSortOrder: (order: SortOrder) => void
  setMarkersSortDirection: (direction: SortDirection) => void
  clearMarkersState: () => void
  
  // Actions for recent
  setRecentSelectedVideo: (video: VideoFile | null) => void
  setRecentVideoFile: (file: File | null) => void
  setRecentSearchQuery: (query: string) => void
  setRecentPlayerState: (state: Partial<MediaPlayerState>) => void
  clearRecentState: () => void
  
  // Actions for favorites
  setFavoritesSelectedVideo: (video: VideoFile | null) => void
  setFavoritesSelectedAudio: (audio: AudioFile | null) => void
  setFavoritesVideoFile: (file: File | null) => void
  setFavoritesSearchQuery: (query: string) => void
  setFavoritesPlayerState: (state: Partial<MediaPlayerState>) => void
  clearFavoritesState: () => void
  
  // Global actions
  clearAllState: () => void
}

const defaultPlayerState: MediaPlayerState = {
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  volume: 1
}

const defaultVideoState: VideoState = {
  selectedVideo: null,
  videoFile: null,
  searchQuery: '',
  playerState: { ...defaultPlayerState },
  videoLoadError: null
}

const defaultAudioState: AudioState = {
  selectedAudio: null,
  searchQuery: '',
  playerState: { ...defaultPlayerState }
}

const defaultYouTubeState: YouTubeState = {
  selectedVideoId: null,
  searchQuery: '',
  playerState: { ...defaultPlayerState },
  expandedPlaylists: []
}

const defaultMarkersState: MarkersState = {
  selectedContentPath: null,
  selectedFile: null,
  searchQuery: '',
  selectedTags: [],
  selectedTypes: ['local', 'youtube', 'audio'],
  completionFilter: 'all',
  sortOrder: 'date',
  sortDirection: 'desc'
}

const defaultRecentState: RecentState = {
  selectedVideo: null,
  videoFile: null,
  searchQuery: '',
  playerState: { ...defaultPlayerState }
}

const defaultFavoritesState: FavoritesState = {
  selectedVideo: null,
  selectedAudio: null,
  videoFile: null,
  searchQuery: '',
  playerState: { ...defaultPlayerState }
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      video: { ...defaultVideoState },
      audio: { ...defaultAudioState },
      youtube: { ...defaultYouTubeState },
      markers: { ...defaultMarkersState },
      recent: { ...defaultRecentState },
      favorites: { ...defaultFavoritesState },

      // Video actions
      setSelectedVideo: (video) =>
        set((state) => ({
          video: {
            ...state.video,
            selectedVideo: video,
            videoFile: null, // Reset file when changing video
            videoLoadError: null,
            playerState: { ...defaultPlayerState } // Reset player state for new video
          }
        })),

      setVideoFile: (file) =>
        set((state) => ({
          video: { ...state.video, videoFile: file }
        })),

      setVideoSearchQuery: (query) =>
        set((state) => ({
          video: { ...state.video, searchQuery: query }
        })),

      setVideoPlayerState: (playerState) =>
        set((state) => ({
          video: {
            ...state.video,
            playerState: { ...state.video.playerState, ...playerState }
          }
        })),

      setVideoLoadError: (error) =>
        set((state) => ({
          video: { ...state.video, videoLoadError: error }
        })),

      clearVideoState: () =>
        set((state) => ({
          video: { ...defaultVideoState }
        })),

      // Audio actions
      setSelectedAudio: (audio) =>
        set((state) => ({
          audio: {
            ...state.audio,
            selectedAudio: audio,
            playerState: { ...defaultPlayerState } // Reset player state for new audio
          }
        })),

      setAudioSearchQuery: (query) =>
        set((state) => ({
          audio: { ...state.audio, searchQuery: query }
        })),

      setAudioPlayerState: (playerState) =>
        set((state) => ({
          audio: {
            ...state.audio,
            playerState: { ...state.audio.playerState, ...playerState }
          }
        })),

      clearAudioState: () =>
        set((state) => ({
          audio: { ...defaultAudioState }
        })),

      // YouTube actions
      setSelectedYouTubeVideo: (videoId) =>
        set((state) => ({
          youtube: {
            ...state.youtube,
            selectedVideoId: videoId,
            playerState: { ...defaultPlayerState } // Reset player state for new video
          }
        })),

      setYouTubeSearchQuery: (query) =>
        set((state) => ({
          youtube: { ...state.youtube, searchQuery: query }
        })),

      setYouTubePlayerState: (playerState) =>
        set((state) => ({
          youtube: {
            ...state.youtube,
            playerState: { ...state.youtube.playerState, ...playerState }
          }
        })),

      setYouTubeExpandedPlaylists: (playlists) =>
        set((state) => ({
          youtube: { ...state.youtube, expandedPlaylists: playlists }
        })),

      toggleYouTubePlaylist: (playlistId) =>
        set((state) => ({
          youtube: {
            ...state.youtube,
            expandedPlaylists: state.youtube.expandedPlaylists.includes(playlistId)
              ? state.youtube.expandedPlaylists.filter(id => id !== playlistId)
              : [...state.youtube.expandedPlaylists, playlistId]
          }
        })),

      clearYouTubeState: () =>
        set((state) => ({
          youtube: { ...defaultYouTubeState }
        })),

      // Markers actions
      setMarkersSelectedContent: (path) =>
        set((state) => ({
          markers: { ...state.markers, selectedContentPath: path }
        })),

      setMarkersSelectedFile: (file) =>
        set((state) => ({
          markers: { ...state.markers, selectedFile: file }
        })),

      setMarkersSearchQuery: (query) =>
        set((state) => ({
          markers: { ...state.markers, searchQuery: query }
        })),

      setMarkersSelectedTags: (tags) =>
        set((state) => ({
          markers: { ...state.markers, selectedTags: tags }
        })),

      setMarkersSelectedTypes: (types) =>
        set((state) => ({
          markers: { ...state.markers, selectedTypes: types }
        })),

      setMarkersCompletionFilter: (filter) =>
        set((state) => ({
          markers: { ...state.markers, completionFilter: filter }
        })),

      setMarkersSortOrder: (order) =>
        set((state) => ({
          markers: { ...state.markers, sortOrder: order }
        })),

      setMarkersSortDirection: (direction) =>
        set((state) => ({
          markers: { ...state.markers, sortDirection: direction }
        })),

      clearMarkersState: () =>
        set((state) => ({
          markers: { ...defaultMarkersState }
        })),
        
      // Recent actions
      setRecentSelectedVideo: (video) =>
        set((state) => ({
          recent: { ...state.recent, selectedVideo: video }
        })),

      setRecentVideoFile: (file) =>
        set((state) => ({
          recent: { ...state.recent, videoFile: file }
        })),

      setRecentSearchQuery: (query) =>
        set((state) => ({
          recent: { ...state.recent, searchQuery: query }
        })),

      setRecentPlayerState: (playerState) =>
        set((state) => ({
          recent: {
            ...state.recent,
            playerState: { ...state.recent.playerState, ...playerState }
          }
        })),

      clearRecentState: () =>
        set((state) => ({
          recent: { ...defaultRecentState }
        })),
        
      // Favorites actions
      setFavoritesSelectedVideo: (video) =>
        set((state) => ({
          favorites: { ...state.favorites, selectedVideo: video, selectedAudio: null }
        })),

      setFavoritesSelectedAudio: (audio) =>
        set((state) => ({
          favorites: { ...state.favorites, selectedAudio: audio, selectedVideo: null }
        })),

      setFavoritesVideoFile: (file) =>
        set((state) => ({
          favorites: { ...state.favorites, videoFile: file }
        })),

      setFavoritesSearchQuery: (query) =>
        set((state) => ({
          favorites: { ...state.favorites, searchQuery: query }
        })),

      setFavoritesPlayerState: (playerState) =>
        set((state) => ({
          favorites: {
            ...state.favorites,
            playerState: { ...state.favorites.playerState, ...playerState }
          }
        })),

      clearFavoritesState: () =>
        set((state) => ({
          favorites: { ...defaultFavoritesState }
        })),

      // Global actions
      clearAllState: () =>
        set(() => ({
          video: { ...defaultVideoState },
          audio: { ...defaultAudioState },
          youtube: { ...defaultYouTubeState },
          markers: { ...defaultMarkersState },
          recent: { ...defaultRecentState },
          favorites: { ...defaultFavoritesState }
        }))
    }),
    {
      name: 'media-storage',
      partialize: (state) => ({
        video: {
          selectedVideo: state.video.selectedVideo,
          searchQuery: state.video.searchQuery,
          playerState: state.video.playerState,
          // Don't persist videoFile (File object) or videoLoadError
        },
        audio: {
          selectedAudio: state.audio.selectedAudio,
          searchQuery: state.audio.searchQuery,
          playerState: state.audio.playerState,
        },
        youtube: {
          selectedVideoId: state.youtube.selectedVideoId,
          searchQuery: state.youtube.searchQuery,
          playerState: state.youtube.playerState,
          expandedPlaylists: state.youtube.expandedPlaylists,
        },
        markers: {
          selectedContentPath: state.markers.selectedContentPath,
          selectedFile: state.markers.selectedFile,
          searchQuery: state.markers.searchQuery,
          selectedTags: state.markers.selectedTags,
          selectedTypes: state.markers.selectedTypes,
          completionFilter: state.markers.completionFilter,
          sortOrder: state.markers.sortOrder,
          sortDirection: state.markers.sortDirection,
        },
        recent: {
          selectedVideo: state.recent.selectedVideo,
          searchQuery: state.recent.searchQuery,
          playerState: state.recent.playerState,
          // Don't persist videoFile (File object)
        },
        favorites: {
          selectedVideo: state.favorites.selectedVideo,
          selectedAudio: state.favorites.selectedAudio,
          searchQuery: state.favorites.searchQuery,
          playerState: state.favorites.playerState,
          // Don't persist videoFile (File object)
        }
      }),
    }
  )
)