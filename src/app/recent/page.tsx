'use client'

import { useState, useEffect, ReactNode } from 'react'
import { recentlyViewedService } from '@/services/recently-viewed'
import { FavoriteButton } from '@/components/video/FavoriteButton'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { VideoTitle } from '@/components/video/VideoTitle'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { YouTubePlayer } from '@/components/youtube/YouTubePlayer'
import { YouTubeInitializer } from '@/components/youtube/YouTubeInitializer'
import type { Video, FileSystemVideo, YouTubeVideo, VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { Header } from '@/components/layout/Header'
import { useDirectoryStore } from '@/stores/directory-store'
import Link from 'next/link'

interface StoredFileVideo extends FileSystemVideo {
  rootDirectoryName: string
  viewedAt: number
}

interface StoredYouTubeVideo extends YouTubeVideo {
  viewedAt: number
}

type StoredVideo = StoredFileVideo | StoredYouTubeVideo

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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export default function RecentPage() {
  const [recentVideos, setRecentVideos] = useState<StoredVideo[]>([])
  const [selectedVideo, setSelectedVideo] = useState<StoredVideo | null>(null)
  const { rootHandle } = useDirectoryStore()
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isChangingDirectory, setIsChangingDirectory] = useState(false)
  const [videoLoadError, setVideoLoadError] = useState<ReactNode | null>(null)
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)

  const { markerState, setMarkerState } = useVideoMarkers(
    selectedVideo ? (
      selectedVideo.type === 'file'
        ? `${selectedVideo.name}-${selectedVideo.path}`
        : `youtube-${selectedVideo.id}`
    ) : ''
  )

  // Function to load recent videos
  const loadRecentVideos = async () => {
    const recent = await recentlyViewedService.getRecentVideos()
    setRecentVideos(recent)
  }

  // Load recent videos on mount and setup storage event listener
  useEffect(() => {
    loadRecentVideos()

    // Listen for storage events to update the list when changes occur
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'recent-videos') {
        loadRecentVideos()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Refresh list when a video is viewed
  useEffect(() => {
    if (selectedVideo) {
      const interval = setInterval(loadRecentVideos, 1000) // Poll for updates
      return () => clearInterval(interval)
    }
  }, [selectedVideo])

  const loadVideo = async (video: StoredVideo) => {
    setSelectedVideo(video)
    setVideoFile(null)
    setVideoLoadError(null)

    if (video.type === 'youtube') {
      // YouTube videos don't need additional loading
      return
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
      const fileHandle = await getFileHandle(rootHandle, video.path)
      const file = await fileHandle.getFile()
      setVideoFile(file)

    } catch (err) {
      console.error('Error loading video:', err)
      
      const errorMessage = (
        <div className="flex flex-col gap-4 p-4 bg-muted rounded">
          <p>Unable to access the video file in the current directory.</p>
          {video.type === 'file' && (
            <p>This video was viewed from directory: <span className="text-sm text-muted-foreground">
              {(video as StoredFileVideo).rootDirectoryName}
            </span></p>
          )}
          <button
            onClick={async () => {
              if (isChangingDirectory) return
              setIsChangingDirectory(true)
              try {
                const newRootHandle = await fileSystemService.requestDirectoryAccess()
                try {
                  const fileHandle = await getFileHandle(newRootHandle, video.path)
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
        <div className="flex-1 flex flex-col py-6 px-6">
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
            {/* Left Side: Recent Videos List */}
            <div className="w-[400px] border rounded p-4 overflow-y-auto flex flex-col gap-2">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold tracking-tight">Recent Videos</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{recentVideos.length} videos</span>
                  {recentVideos.length > 0 && (
                    <button
                      onClick={async () => {
                        await recentlyViewedService.clearRecentVideos()
                        setRecentVideos([])
                        setSelectedVideo(null)
                        setVideoFile(null)
                      }}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Clear History
                    </button>
                  )}
                </div>
              </div>
              
              {recentVideos.length > 0 ? (
                recentVideos.map((video) => {
                  const isSelected = video.type === 'file'
                    ? selectedVideo?.type === 'file' && selectedVideo.path === video.path
                    : selectedVideo?.type === 'youtube' && selectedVideo.id === video.id

                  return (
                    <button
                      key={video.type === 'file'
                        ? `file-${video.path}-${video.viewedAt}`
                        : `youtube-${video.id}-${video.viewedAt}`}
                      className={`text-left p-2 border rounded hover:bg-gray-100 w-full ${
                        isSelected ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      onClick={() => loadVideo(video)}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          {video.type === 'file' ? (
                            <VideoTitle
                              title={video.path}
                              videoPath={video.path}
                              className="truncate"
                            />
                          ) : (
                            <span className="truncate" title={video.title || video.id}>
                              {video.title || video.id}
                            </span>
                          )}
                          {rootHandle && video.type === 'file' && (
                            <FavoriteButton
                              video={video as StoredFileVideo}
                              directoryHandle={rootHandle}
                              onFavoriteChange={() => {}}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Viewed: {formatDate(video.viewedAt)}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
                            {video.type === 'file' ? 'Local' : 'YouTube'}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No recently viewed videos.</p>
              )}
            </div>

            {/* Right Side: Player and Editor */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
              {videoLoadError && (
                <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg">
                  {videoLoadError}
                </div>
              )}
              
              {/* Video Player Area */}
              <div className="aspect-video bg-muted rounded flex items-center justify-center">
                {selectedVideo ? (
                  selectedVideo.type === 'file' ? (
                    <VideoPlayer
                      videoFile={videoFile}
                      video={selectedVideo as StoredFileVideo}
                      directoryHandle={rootHandle || undefined}
                      className="w-full h-full rounded"
                      onControlsReady={setVideoControls}
                    />
                  ) : (
                    <YouTubeInitializer>
                      <YouTubePlayer
                        videoId={selectedVideo.id}
                        className="w-full h-full rounded"
                        onControlsReady={setVideoControls}
                      />
                    </YouTubeInitializer>
                  )
                ) : (
                  <p className="text-muted-foreground">Select a video from the list</p>
                )}
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  )
}