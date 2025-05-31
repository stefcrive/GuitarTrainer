'use client'

import { useState, useEffect, ReactNode } from 'react'
import { favoritesService } from '@/services/favorites'
import { recentlyViewedService } from '@/services/recently-viewed'
import { FavoriteButton as VideoFavoriteButton } from '@/components/video/FavoriteButton'
import { FavoriteButton as AudioFavoriteButton } from '@/components/audio/FavoriteButton'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { YouTubeInitializer } from '@/components/youtube/YouTubeInitializer'
import { VideoTitle } from '@/components/video/VideoTitle'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import type { VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { Header } from '@/components/layout/Header'
import { useDirectoryStore } from '@/stores/directory-store'
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

interface StoredAudioFavorite {
  name: string
  path: string
  type: 'mp3' | 'wav' | 'aiff'
  rootDirectoryName: string
  metadata?: {
    id: string
    path: string
    title?: string
    tags: string[]
    loopRegion: {
      start: number
      end: number
      enabled: boolean
    }
    markers: any[]
    playbackRate: number
  }
}

interface LoadedAudioFavorite extends StoredAudioFavorite {
  handle: FileSystemFileHandle
}

async function getFileHandle(rootHandle: FileSystemDirectoryHandle, path: string) {
  const segments = path.split('/')
  let currentHandle: FileSystemDirectoryHandle = rootHandle

  try {
    for (let i = 0; i < segments.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(segments[i])
      if (!currentHandle) {
        throw new Error(`Directory not found: ${segments[i]}`)
      }
    }

    const fileName = segments[segments.length - 1]
    const fileHandle = await currentHandle.getFileHandle(fileName)
    if (!fileHandle) {
      throw new Error(`File not found: ${fileName}`)
    }

    return fileHandle
  } catch (err) {
    console.error('Error traversing path:', err)
    throw new Error(`Error accessing file: ${path}`)
  }
}

export default function FavoritesPage() {
  const [videoFavorites, setVideoFavorites] = useState<StoredVideoFavorite[]>([])
  const [audioFavorites, setAudioFavorites] = useState<StoredAudioFavorite[]>([])
  const [selectedVideo, setSelectedVideo] = useState<StoredVideoFavorite | null>(null)
  const [selectedAudio, setSelectedAudio] = useState<LoadedAudioFavorite | null>(null)
  const { rootHandle } = useDirectoryStore()
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isChangingDirectory, setIsChangingDirectory] = useState(false)
  const [videoLoadError, setVideoLoadError] = useState<ReactNode | null>(null)
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)

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
    }
    loadFavorites()
  }, [])

  const loadVideo = async (video: StoredVideoFavorite) => {
    setSelectedVideo(video)
    setVideoFile(null)
    setVideoLoadError(null)

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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col py-6">
          {!rootHandle && (
            <div className="flex flex-col items-center justify-center gap-4 mb-4 p-4 bg-muted rounded">
              <p>No root directory selected</p>
              <Link 
                href="/settings"
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Go to Settings
              </Link>
            </div>
          )}

          <div className="flex flex-1 gap-6 overflow-hidden">
            {/* Left Side: Favorites List */}
            <div className="flex flex-col gap-4 w-[400px]">
              {/* Favorite Videos */}
              <div className="border rounded p-4 overflow-y-auto flex flex-col gap-2">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold tracking-tight">Favorite Videos</h2>
                  <span className="text-sm text-muted-foreground">{videoFavorites.length} videos</span>
                </div>
                
                {videoFavorites.length > 0 ? (
                  videoFavorites.map((video) => (
                    <button
                      key={video.type === 'file' ? video.path : video.id}
                      className={`text-left p-2 border rounded hover:bg-gray-100 w-full ${
                        selectedVideo?.id === video.id ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      onClick={() => loadVideo(video)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <VideoTitle
                          title={video.type === 'file' ? video.path! : (video.title ?? `YouTube: ${video.id}`)}
                          videoId={video.type === 'youtube' ? video.id : undefined}
                          videoPath={video.type === 'file' ? video.path : undefined}
                          className="truncate"
                        />
                        {(video.type === 'youtube' || rootHandle) && (
                          <VideoFavoriteButton
                            video={{
                              ...(video.type === 'youtube'
                                ? {
                                    type: 'youtube' as const,
                                    id: video.id,
                                    title: video.title,
                                  }
                                : {
                                    type: 'file' as const,
                                    id: video.id,
                                    name: video.name!,
                                    path: video.path!,
                                  }
                              )
                            }}
                            directoryHandle={video.type === 'file' ? rootHandle : undefined}
                            onFavoriteChange={async (isFavorite) => {
                              if (!isFavorite) {
                                const favs = await favoritesService.getVideoFavorites()
                                setVideoFavorites(favs)
                                if (selectedVideo?.id === video.id) {
                                  setSelectedVideo(null)
                                  setVideoFile(null)
                                }
                              }
                            }}
                          />
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No favorite videos yet.</p>
                )}
              </div>

              {/* Favorite Audio Tracks */}
              <div className="border rounded p-4 overflow-y-auto flex flex-col gap-2">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold tracking-tight">Favorite Tracks</h2>
                  <span className="text-sm text-muted-foreground">{audioFavorites.length} tracks</span>
                </div>
                
                {audioFavorites.length > 0 ? (
                  audioFavorites.map((audio) => (
                    <button
                      key={audio.path}
                      className={`text-left p-2 border rounded hover:bg-gray-100 w-full ${
                        selectedAudio?.path === audio.path ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      onClick={async () => {
                        try {
                          const fileHandle = await getFileHandle(rootHandle!, audio.path)
                          setSelectedAudio({
                            ...audio,
                            handle: fileHandle as FileSystemFileHandle
                          })
                        } catch (err) {
                          console.error('Error loading audio:', err)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{audio.name}</span>
                        {rootHandle && (
                          <AudioFavoriteButton
                            audio={{
                              name: audio.name,
                              path: audio.path,
                              type: audio.type,
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
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No favorite tracks yet.</p>
                )}
              </div>
            </div>

            {/* Right Side: Player and Editor */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
              {videoLoadError && (
                <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                  {videoLoadError}
                </div>
              )}
              
              {/* Media Player Area */}
              {selectedVideo ? (
                <div className="aspect-video bg-muted rounded flex items-center justify-center">
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
              ) : selectedAudio ? (
                <div className="bg-muted rounded">
                  <AudioPlayer
                    audioFile={{
                      name: selectedAudio.name,
                      path: selectedAudio.path,
                      type: selectedAudio.type,
                      handle: selectedAudio.handle
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded flex items-center justify-center">
                  <p className="text-muted-foreground">Select a video or audio track from the list</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}