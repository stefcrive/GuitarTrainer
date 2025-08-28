'use client'

import { useState, useEffect, ReactNode } from 'react'
import { favoritesService } from '@/services/favorites'
import { AudioMetadata, StoredAudioFile } from '@/types/audio'
import { recentlyViewedService } from '@/services/recently-viewed'
import { FavoriteButton as VideoFavoriteButton } from '@/components/video/FavoriteButton'
import { FavoriteButton as AudioFavoriteButton } from '@/components/audio/FavoriteButton'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { YouTubeInitializer } from '@/components/youtube/YouTubeInitializer'
import { VideoTitle } from '@/components/video/VideoTitle'
import { Input } from '@/components/ui/input'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import type { VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { Header } from '@/components/layout/Header'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { Search, Video as VideoIcon, Music, Youtube, Folder, Star, ChevronRight, ChevronDown, Circle } from 'lucide-react'
import Link from 'next/link'
import { Video, FileSystemVideo } from '@/types/video'

interface StoredVideoFavorite {
  id: string
  type: 'file' | 'youtube'
  name?: string
  path?: string
  rootDirectoryName?: string
  title?: string // For YouTube videos
}

interface LoadedAudioFavorite extends StoredAudioFile {
  handle: FileSystemFileHandle
}

async function getFileHandle(rootHandle: FileSystemDirectoryHandle, path: string) {
  // Sanitize and normalize the path
  const normalizedPath = path
    .replace(/\\/g, '/') // Convert backslashes to forward slashes
    .replace(/\/+/g, '/') // Replace multiple slashes with single slash
    .replace(/^\/|\/$/g, '') // Remove leading and trailing slashes
    .split('/')
    .map(segment => decodeURIComponent(segment.trim())) // Decode and trim each segment
    .filter(segment => segment.length > 0) // Remove empty segments

  console.log('Processing path segments:', normalizedPath)
  
  let currentHandle: FileSystemDirectoryHandle = rootHandle

  try {
    // For each directory in the path
    for (let i = 0; i < normalizedPath.length - 1; i++) {
      const segment = normalizedPath[i]
      console.log(`Accessing directory: "${segment}" in "${currentHandle.name}"`)
      
      try {
        currentHandle = await currentHandle.getDirectoryHandle(segment)
      } catch (err) {
        console.error(`Failed to access directory '${segment}' in '${currentHandle.name}':`, err)
        throw new Error(`Directory not found: ${segment} (in ${currentHandle.name})`)
      }
    }

    // Get the file from the final directory
    const fileName = normalizedPath[normalizedPath.length - 1]
    console.log(`Accessing file: "${fileName}" in "${currentHandle.name}"`)
    
    try {
      return await currentHandle.getFileHandle(fileName)
    } catch (err) {
      console.error(`Failed to access file '${fileName}' in '${currentHandle.name}':`, err)
      throw new Error(`File not found: ${fileName} (in ${currentHandle.name})`)
    }
  } catch (err) {
    console.error('Error traversing path:', err)
    throw err
  }
}

export default function FavoritesPage() {
  const [videoFavorites, setVideoFavorites] = useState<StoredVideoFavorite[]>([])
  const [audioFavorites, setAudioFavorites] = useState<StoredAudioFile[]>([])
  const [filteredVideoFavorites, setFilteredVideoFavorites] = useState<StoredVideoFavorite[]>([])
  const [filteredAudioFavorites, setFilteredAudioFavorites] = useState<StoredAudioFile[]>([])
  const [selectedVideo, setSelectedVideo] = useState<StoredVideoFavorite | null>(null)
  const [selectedAudio, setSelectedAudio] = useState<LoadedAudioFavorite | null>(null)
  const { rootHandle, audioRootHandle } = useDirectoryStore()
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isChangingDirectory, setIsChangingDirectory] = useState(false)
  const [videoLoadError, setVideoLoadError] = useState<ReactNode | null>(null)
  const [audioLoadError, setAudioLoadError] = useState<ReactNode | null>(null)
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)

  // Collapsible UI state
  const [isLocalVideosCollapsed, setIsLocalVideosCollapsed] = useState(false)
  const [isYouTubeCollapsed, setIsYouTubeCollapsed] = useState(false)
  const [openAudioGroups, setOpenAudioGroups] = useState<Record<string, boolean>>({})

  // Use dedicated favorites state for persistence
  const {
    favorites: { searchQuery, selectedVideo: favoritesSelectedVideo, selectedAudio: favoritesSelectedAudio },
    setFavoritesSearchQuery,
    setFavoritesSelectedVideo,
    setFavoritesVideoFile,
    setFavoritesSelectedAudio
  } = useMediaStore()

  const { markerState, setMarkerState } = useVideoMarkers(
    selectedVideo ? 
      selectedVideo.type === 'file' ? 
        `${selectedVideo.name}-${selectedVideo.path}` : 
        `youtube:${selectedVideo.id}` : 
      ''
  )

  useEffect(() => {
    const loadFavorites = async () => {
      const videoFavs = await favoritesService.getVideoFavorites()
      const audioFavs = await favoritesService.getAudioFavorites()
      setVideoFavorites(videoFavs)
      setAudioFavorites(audioFavs)
      setFilteredVideoFavorites(videoFavs)
      setFilteredAudioFavorites(audioFavs)
    }
    loadFavorites()
  }, [])

  // Filter favorites based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredVideoFavorites(videoFavorites)
      setFilteredAudioFavorites(audioFavorites)
    } else {
      const query = searchQuery.toLowerCase()
      
      const filteredVideos = videoFavorites.filter(video => {
        const title = video.type === 'file' ? video.name || video.path : video.title
        return title?.toLowerCase().includes(query) || video.path?.toLowerCase().includes(query)
      })
      
      const filteredAudios = audioFavorites.filter(audio =>
        audio.name.toLowerCase().includes(query) ||
        audio.path.toLowerCase().includes(query)
      )
      
      setFilteredVideoFavorites(filteredVideos)
      setFilteredAudioFavorites(filteredAudios)
    }
  }, [videoFavorites, audioFavorites, searchQuery])

  // Restore selected content when page loads
  useEffect(() => {
    if (favoritesSelectedVideo && videoFavorites.length > 0 && !selectedVideo) {
      const favoriteVideo = videoFavorites.find(v =>
        v.type === 'file' ? v.path === favoritesSelectedVideo.path : v.id === favoritesSelectedVideo.id
      )
      if (favoriteVideo) {
        loadVideo(favoriteVideo)
      }
    }
    
    if (favoritesSelectedAudio && audioFavorites.length > 0 && !selectedAudio) {
      const favoriteAudio = audioFavorites.find(a => a.path === favoritesSelectedAudio.path)
      if (favoriteAudio) {
        // Load the audio file
        const loadAudioFile = async () => {
          try {
            let fileHandle: FileSystemFileHandle | null = null
            
            if (audioRootHandle) {
              try {
                fileHandle = await getFileHandle(audioRootHandle, favoriteAudio.path)
              } catch (err) {
                // Try rootHandle if audioRootHandle fails
              }
            }
            
            if (!fileHandle && rootHandle) {
              try {
                fileHandle = await getFileHandle(rootHandle, favoriteAudio.path)
              } catch (err) {
                // Handle error
              }
            }
            
            if (fileHandle) {
              setSelectedAudio({
                ...favoriteAudio,
                handle: fileHandle
              })
              setFavoritesSelectedAudio({
                id: favoriteAudio.path,
                name: favoriteAudio.name,
                path: favoriteAudio.path,
                type: 'file',
                handle: fileHandle
              })
            }
          } catch (error) {
            console.error('Error loading audio file:', error)
          }
        }
        loadAudioFile()
      }
    }
  }, [favoritesSelectedVideo, favoritesSelectedAudio, videoFavorites, audioFavorites, selectedVideo, selectedAudio, rootHandle, audioRootHandle])

  const loadVideo = async (video: StoredVideoFavorite) => {
    setSelectedVideo(video)
    setVideoFile(null)
    setVideoLoadError(null)
    
    // Clear selected audio
    setSelectedAudio(null)
    
    // Persist to favorites state
    if (video.type === 'file') {
      setFavoritesSelectedVideo({
        type: 'file',
        id: video.id,
        name: video.name!,
        path: video.path!
      })
    }

    if (video.type === 'youtube') {
      return // YouTube videos don't need additional loading
    }

    if (!rootHandle) {
      const errorMessage = (
        <div className="flex flex-col gap-2">
          <p>Please select a root directory in settings first</p>
          <Link 
            href="/settings" 
            className="text-sm text-blue-600 hover:underline"
          >
            Go to Settings
          </Link>
        </div>
      )
      setVideoLoadError(errorMessage)
      return
    }

    try {
      const fileHandle = await getFileHandle(rootHandle, video.path!)
      const file = await fileHandle.getFile()
      setVideoFile(file)
      setFavoritesVideoFile(file)

      // Mark video as viewed when loaded
      await recentlyViewedService.addRecentVideo(
        {
          type: 'file',
          id: video.id,
          name: video.name!,
          path: video.path!,
          hasMetadata: false
        } as FileSystemVideo, 
        rootHandle
      )

    } catch (err) {
      console.error('Error loading video:', err)
      
      const errorMessage = (
        <div className="flex flex-col gap-4 p-4 bg-muted rounded">
          <p>Unable to access the video file in the current directory.</p>
          <p>The video was favorited from directory: <span className="text-sm text-muted-foreground">{video.rootDirectoryName}</span></p>
          <button
            onClick={async () => {
              if (isChangingDirectory) return
              setIsChangingDirectory(true)
              try {
                const newRootHandle = await fileSystemService.requestDirectoryAccess()
                try {
                  await getFileHandle(newRootHandle, video.path!)
                  useDirectoryStore.getState().setRootHandle(newRootHandle)
                  setVideoLoadError(null)
                  loadVideo(video)
                } catch (accessErr) {
                  setVideoLoadError(
                    <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                      Video not found in selected directory. Please select the directory containing the video.
                    </div>
                  )
                }
              } catch (dirErr) {
                setVideoLoadError(
                  <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                    Failed to access new directory
                  </div>
                )
              } finally {
                setIsChangingDirectory(false)
              }
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 w-fit disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isChangingDirectory}
          >
            {isChangingDirectory ? "Switching..." : "Switch Directory"}
          </button>
        </div>
      )
      setVideoLoadError(errorMessage)
      setVideoFile(null)
    }
  }

// Group videos by type and audio by directory for collapsible folders
const fileVideos = filteredVideoFavorites.filter(v => v.type === 'file')
const youtubeVideos = filteredVideoFavorites.filter(v => v.type === 'youtube')

// Group audio by rootDirectoryName or top-level folder.
// Use a correctly typed reduce to avoid TS index signature errors.
const groupedAudio = filteredAudioFavorites.reduce<Record<string, StoredAudioFile[]>>((acc, audio) => {
 const groupKey = audio.rootDirectoryName || (audio.path ? audio.path.split('/')[0] : 'Unknown')
 if (!acc[groupKey]) acc[groupKey] = []
 acc[groupKey].push(audio)
 return acc
}, {})
  if (!rootHandle) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <div className="flex flex-col items-center justify-center gap-4 h-full">
            <p>Please select a root directory in settings first</p>
            <Link
              href="/settings"
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ResizablePanelGroup direction="horizontal" className="min-h-screen">
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full border-r bg-muted/30">
              <div className="p-4 space-y-4">
                <h2 className="text-xl font-semibold mb-4">Favorites</h2>
                
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search your favorites..."
                    value={searchQuery}
                    onChange={(e) => setFavoritesSearchQuery(e.target.value)}
                    className="pl-9 h-10 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-primary/50 transition-colors"
                  />
                </div>
                
                {/* Quick Stats */}
                <div className="flex gap-2 text-xs">
                  <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg flex items-center gap-2">
                    <VideoIcon className="h-3 w-3" />
                    <span>{filteredVideoFavorites.length} Videos</span>
                  </div>
                  <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg flex items-center gap-2">
                    <Music className="h-3 w-3" />
                    <span>{filteredAudioFavorites.length} Audio</span>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-300px)] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800">
                  {/* Favorite Videos */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <VideoIcon className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-foreground">Videos</h3>
                      <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">{filteredVideoFavorites.length}</span>
                    </div>

                    {/* Local Videos (collapsible) */}
                    <div>
                      <button
                        className="flex items-center w-full p-2 hover:bg-accent rounded text-left font-medium"
                        onClick={() => setIsLocalVideosCollapsed(prev => !prev)}
                      >
                        {isLocalVideosCollapsed ? (
                          <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
                        )}
                        <Folder className="h-4 w-4 mr-2 text-blue-600" />
                        <span className="flex-1">Local Videos</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          {fileVideos.length}
                        </span>
                      </button>

                      {!isLocalVideosCollapsed && (
                        <div className="space-y-0.5">
                          {fileVideos.length > 0 ? (
                            fileVideos.map((video) => (
                              <div
                                key={video.path}
                                className={`flex items-center justify-between w-full py-1 px-2 hover:bg-accent rounded text-left cursor-pointer bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 ${selectedVideo?.id === video.id ? 'bg-accent text-accent-foreground' : ''}`}
                                style={{ paddingLeft: '32px' }}
                                onClick={() => loadVideo(video)}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <VideoIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                  <VideoTitle
                                    title={video.name || video.path!}
                                    videoPath={video.path}
                                    className="truncate"
                                  />
                                  <Star className="h-3 w-3 text-yellow-500 fill-current flex-shrink-0" />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-center py-6">
                              <p className="text-sm text-muted-foreground">No local videos</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* YouTube Videos (collapsible) */}
                    <div>
                      <button
                        className="flex items-center w-full p-2 hover:bg-accent rounded text-left font-medium"
                        onClick={() => setIsYouTubeCollapsed(prev => !prev)}
                      >
                        {isYouTubeCollapsed ? (
                          <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
                        )}
                        <Youtube className="h-4 w-4 mr-2 text-red-500" />
                        <span className="flex-1">YouTube Videos</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          {youtubeVideos.length}
                        </span>
                      </button>

                      {!isYouTubeCollapsed && (
                        <div className="space-y-0.5">
                          {youtubeVideos.length > 0 ? (
                            youtubeVideos.map((video) => (
                              <div
                                key={video.id}
                                className={`flex items-center justify-between w-full py-1 px-2 hover:bg-accent rounded text-left cursor-pointer bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 ${selectedVideo?.id === video.id ? 'bg-accent text-accent-foreground' : ''}`}
                                style={{ paddingLeft: '32px' }}
                                onClick={() => loadVideo(video)}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Youtube className="h-4 w-4 text-red-500 flex-shrink-0" />
                                  <VideoTitle
                                    title={video.title || `YouTube: ${video.id}`}
                                    videoId={video.id}
                                    className="truncate"
                                  />
                                  <Star className="h-3 w-3 text-yellow-500 fill-current flex-shrink-0" />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-center py-6">
                              <p className="text-sm text-muted-foreground">No YouTube favorites</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Favorite Audio Tracks grouped into collapsible folders */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Music className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-foreground">Audio</h3>
                      <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full font-medium">{filteredAudioFavorites.length}</span>
                    </div>

                    {Object.keys(groupedAudio).length > 0 ? (
                      Object.entries(groupedAudio).map(([groupName, audios]) => {
                        const isOpen = !!openAudioGroups[groupName]
                        return (
                          <div key={groupName}>
                            <button
                              className="flex items-center w-full p-2 hover:bg-accent rounded text-left font-medium"
                              onClick={() => setOpenAudioGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
                              )}
                              <Folder className="h-4 w-4 mr-2 text-purple-600" />
                              <span className="flex-1">{groupName}</span>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                {audios.length}
                              </span>
                            </button>

                            {isOpen && (
                              <div className="space-y-0.5">
                                {audios.map((audio) => (
                                  <div
                                    key={audio.path}
                                    className={`flex items-center justify-between w-full py-1 px-2 hover:bg-accent rounded text-left cursor-pointer bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 ${selectedAudio?.path === audio.path ? 'bg-accent text-accent-foreground' : ''}`}
                                    style={{ paddingLeft: '32px' }}
                                    onClick={async () => {
                                      // Clear any selected video first
                                      setSelectedVideo(null)
                                      setVideoFile(null)
                                      
                                      try {
                                        let fileHandle: FileSystemFileHandle | null = null
                                        
                                        // Try audioRootHandle first if available
                                        if (audioRootHandle) {
                                          try {
                                            fileHandle = await getFileHandle(audioRootHandle, audio.path)
                                          } catch (err) {
                                            // Silently continue to try next directory
                                          }
                                        }

                                        // If not found in audio root, try the video root handle
                                        if (!fileHandle && rootHandle) {
                                          try {
                                            fileHandle = await getFileHandle(rootHandle, audio.path)
                                          } catch (err) {
                                            // Silently continue
                                          }
                                        }

                                        if (fileHandle) {
                                          setSelectedAudio({
                                            ...audio,
                                            handle: fileHandle
                                          })
                                          setFavoritesSelectedAudio({
                                            id: audio.path,
                                            name: audio.name,
                                            path: audio.path,
                                            type: 'file',
                                            handle: fileHandle
                                          })
                                          setAudioLoadError(null)
                                          setVideoLoadError(null)
                                        } else {
                                          throw new Error('Audio file not found in any available directory')
                                        }
                                      } catch (err) {
                                        console.error('Error loading audio:', err)
                                        const errorMessage = (
                                          <div className="flex flex-col gap-4 p-4 bg-muted rounded">
                                            <p>Unable to access the audio file in the current directory.</p>
                                            <p>The audio was favorited from directory: <span className="text-sm text-muted-foreground">{audio.rootDirectoryName}</span></p>
                                            <button
                                              onClick={async () => {
                                                if (isChangingDirectory) return
                                                setIsChangingDirectory(true)
                                                try {
                                                  const newRootHandle = await fileSystemService.requestDirectoryAccess()
                                                  try {
                                                    // Try to get the file in the selected directory
                                                    const fileHandle = await getFileHandle(newRootHandle, audio.path)
                                                    
                                                    // If successful, set both handles since this could be either type of directory
                                                    useDirectoryStore.getState().setRootHandle(newRootHandle)
                                                    useDirectoryStore.getState().setAudioRootHandle(newRootHandle)
                                                    
                                                    setAudioLoadError(null)
                                                    setSelectedAudio({
                                                      ...audio,
                                                      handle: fileHandle
                                                    })
                                                  } catch (accessErr) {
                                                    setAudioLoadError(
                                                      <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                                                        Audio file not found in selected directory. Please select the directory containing the audio file.
                                                      </div>
                                                    )
                                                  }
                                                } catch (dirErr) {
                                                  setAudioLoadError(
                                                    <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                                                      Failed to access new directory
                                                    </div>
                                                  )
                                                } finally {
                                                  setIsChangingDirectory(false)
                                                }
                                              }}
                                              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 w-fit disabled:opacity-50 disabled:cursor-not-allowed"
                                              disabled={isChangingDirectory}
                                            >
                                              {isChangingDirectory ? 'Switching...' : 'Switch Directory'}
                                            </button>
                                          </div>
                                        )
                                        setAudioLoadError(errorMessage)
                                        setSelectedAudio(null)
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Music className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                      <span className="truncate">{audio.name}</span>
                                      {audio.metadata?.markers?.length && (
                                        <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />
                                      )}
                                      <Star className="h-3 w-3 text-yellow-500 fill-current flex-shrink-0" />
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                      {rootHandle && (
                                        <AudioFavoriteButton
                                          audio={{
                                            id: audio.path,
                                            name: audio.name,
                                            path: audio.path,
                                            type: 'file',
                                            handle: undefined as any // Will be set when loaded
                                          }}
                                          metadata={audio.metadata}
                                          directoryHandle={rootHandle}
                                          onFavoriteChange={async (isFavorite) => {
                                            if (!isFavorite) {
                                              const favs = await favoritesService.getAudioFavorites()
                                              setAudioFavorites(favs)
                                              if (selectedAudio?.path === audio.path) {
                                                setSelectedAudio(null)
                                              }
                                            }
                                          }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 px-4">
                        <Music className="h-12 w-12 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground text-center">{searchQuery ? 'No audio tracks match your search.' : 'No favorite tracks yet.'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={70}>
            <div className="p-4">
              {(videoLoadError || audioLoadError) && (
                <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg mb-4">
                  {videoLoadError || audioLoadError}
                </div>
              )}
              {selectedVideo ? (
                <div className="space-y-4">
                  {/* Display video title at the top */}
                  <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md">
                    <h2 className="text-lg font-medium truncate">
                      {selectedVideo.type === 'file'
                        ? selectedVideo.name || selectedVideo.path
                        : selectedVideo.title || `YouTube Video: ${selectedVideo.id}`}
                    </h2>
                  </div>
                  <div className="aspect-video bg-muted rounded">
                    {selectedVideo.type === 'youtube' ? (
                      <YouTubeInitializer>
                        <YouTubePlayer
                          videoId={selectedVideo.id}
                          className="w-full h-full rounded"
                          onControlsReady={setVideoControls}
                        />
                      </YouTubeInitializer>
                    ) : rootHandle ? (
                      <VideoPlayer
                        videoFile={videoFile}
                        video={{
                          type: 'file',
                          id: selectedVideo.id,
                          name: selectedVideo.name!,
                          path: selectedVideo.path!,
                        } as FileSystemVideo}
                        directoryHandle={rootHandle}
                        className="w-full h-full rounded"
                        onControlsReady={setVideoControls}
                      />
                    ) : null}
                  </div>
                </div>
              ) : selectedAudio ? (
                <div className="space-y-4">
                  {/* Display audio title at the top */}
                  <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md">
                    <h2 className="text-lg font-medium truncate">
                      {selectedAudio.name || selectedAudio.path}
                    </h2>
                  </div>
                  <div className="bg-muted rounded">
                    <AudioPlayer
                      audioFile={{
                        id: selectedAudio.path,
                        type: 'file',
                        name: selectedAudio.name,
                        path: selectedAudio.path,
                        handle: selectedAudio.handle,
                        fileType: selectedAudio.fileType
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a video or audio track from the list
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}