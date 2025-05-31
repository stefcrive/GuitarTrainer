'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { VideoFolderList } from '@/components/video/VideoFolderList'
import type { VideoFile } from '@/services/file-system'
import type { VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { Header } from '@/components/layout/Header'
import { useDirectoryStore } from '@/stores/directory-store'
import Link from 'next/link'

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

export default function VideosPage() {
  const searchParams = useSearchParams()
  const videoPath = searchParams.get('video')
  const markerId = searchParams.get('marker')

  const [videos, setVideos] = useState<VideoFile[]>([])
  const { rootHandle, lastUpdate, expandToPath } = useDirectoryStore()
  const [error, setError] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null)

  const { markerState, setMarkerState } = useVideoMarkers(
    selectedVideo ? `${selectedVideo.name}-${selectedVideo.path}` : ''
  )
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)

  // Load video from URL parameters
  useEffect(() => {
    if (rootHandle && videoPath) {
      // Find the video in the list that matches the path
      fileSystemService.getVideosFromDirectory(rootHandle)
        .then(videos => {
          const video = videos.find(v => v.path === videoPath)
          if (video) {
            // Expand folders to the video path when loading from URL
            expandToPath(video.path)
            loadVideo(video)
          }
        })
        .catch(console.error)
    }
  }, [rootHandle, videoPath])

  useEffect(() => {
    if (rootHandle) {
      fileSystemService.getVideosFromDirectory(rootHandle)
        .then(setVideos)
        .catch((error: Error) => {
          console.error('Error loading videos:', error)
          setError('Error loading videos from directory')
        })
    }
  }, [rootHandle, lastUpdate])

  const loadVideo = async (video: VideoFile) => {
    setSelectedVideo(video)
    setVideoFile(null)
    setVideoLoadError(null)

    try {
      if (!rootHandle) {
        throw new Error('No root directory selected')
      }

      const fileHandle = await getFileHandle(rootHandle, video.path)
      const file = await fileHandle.getFile()
      setVideoFile(file)

      // Mark video as viewed when loaded
      await recentlyViewedService.addRecentVideo(video, rootHandle)
    } catch (err) {
      console.error('Error loading video:', err)
      setVideoLoadError(err instanceof Error ? err.message : 'Error loading video')
      setVideoFile(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col py-6">
          {!rootHandle ? (
            <div className="flex flex-col items-center justify-center gap-4">
              <p>Please select a root directory in settings first</p>
              <Link 
                href="/settings"
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Go to Settings
              </Link>
            </div>
          ) : (
            <div className="flex flex-1 gap-6 overflow-hidden">
              {/* Left Side: Found Videos List */}
              <div className="w-[400px] border rounded p-4 overflow-y-auto flex flex-col gap-2">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight">Videos</h2>
                    <span className="text-sm text-muted-foreground">{videos.length} videos</span>
                  </div>
                  {error && (
                    <div className="p-2 text-sm text-red-800 bg-red-50 rounded-lg">
                      {error}
                    </div>
                  )}
                  {videos.length > 0 ? (
                    <VideoFolderList
                      videos={videos}
                      selectedVideo={selectedVideo}
                      onVideoSelect={loadVideo}
                      directoryHandle={rootHandle}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No videos found in the selected directory.</p>
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
                {/* Video Player Area */}
                <div className="space-y-2">
                  {selectedVideo && (
                    <h2 className="text-xl font-semibold truncate">
                      {selectedVideo.name}
                    </h2>
                  )}
                  <div className="aspect-video bg-muted rounded flex items-center justify-center">
                  {selectedVideo && rootHandle ? (
                    <VideoPlayer
                      videoFile={videoFile}
                      video={selectedVideo}
                      directoryHandle={rootHandle}
                      className="w-full h-full rounded"
                      onControlsReady={(controls) => {
                        setVideoControls(controls)
                        // If a marker ID is provided, seek to that marker's position
                        if (markerId && markerState) {
                          const marker = markerState.markers.find(m => m.id === markerId)
                          if (marker) {
                            controls.seek(marker.startTime)
                          }
                        }
                      }}
                      onPrevVideo={() => {
                        const currentIndex = videos.findIndex(v => v.path === selectedVideo.path)
                        if (currentIndex > 0) {
                          loadVideo(videos[currentIndex - 1])
                        }
                      }}
                      onNextVideo={() => {
                        const currentIndex = videos.findIndex(v => v.path === selectedVideo.path)
                        if (currentIndex < videos.length - 1) {
                          loadVideo(videos[currentIndex + 1])
                        }
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground">Select a video from the list</p>
                  )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
