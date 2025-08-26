'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { VideoFolderList } from '@/components/video/VideoFolderList'
import { Input } from '@/components/ui/input'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { VideoFile } from '@/services/file-system'
import type { VideoPlayerControls } from '@/types/video'
import { fileSystemService } from '@/services/file-system'
import { recentlyViewedService } from '@/services/recently-viewed'
import { useVideoMarkers } from '@/hooks/useVideoMarkers'
import { Header } from '@/components/layout/Header'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { Search } from 'lucide-react'
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
  const [filteredVideos, setFilteredVideos] = useState<VideoFile[]>([])
  const { rootHandle, lastUpdate, expandToPath } = useDirectoryStore()
  const [error, setError] = useState<string | null>(null)
  
  // Use global media store instead of local state
  const {
    video: { selectedVideo, videoFile, searchQuery, videoLoadError },
    setSelectedVideo,
    setVideoFile,
    setVideoSearchQuery,
    setVideoLoadError
  } = useMediaStore()

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

  // Restore video file when page loads if there's a selected video but no file
  useEffect(() => {
    if (selectedVideo && !videoFile && rootHandle) {
      loadVideo(selectedVideo)
    }
  }, [selectedVideo, videoFile, rootHandle])

  useEffect(() => {
    if (rootHandle) {
      fileSystemService.getVideosFromDirectory(rootHandle)
        .then(videos => {
          setVideos(videos)
          setFilteredVideos(videos)
        })
        .catch((error: Error) => {
          console.error('Error loading videos:', error)
          setError('Error loading videos from directory')
        })
    }
  }, [rootHandle, lastUpdate])

  // Filter videos based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredVideos(videos)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = videos.filter(video =>
        video.name.toLowerCase().includes(query) ||
        video.path.toLowerCase().includes(query)
      )
      setFilteredVideos(filtered)
    }
  }, [videos, searchQuery])

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
                <h2 className="text-xl font-semibold">Video Library</h2>
                
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search videos..."
                    value={searchQuery}
                    onChange={(e) => setVideoSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {error && (
                  <div className="p-2 text-sm text-red-800 bg-red-50 rounded-lg">
                    {error}
                  </div>
                )}
                
                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                  {filteredVideos.length > 0 ? (
                    <VideoFolderList
                      videos={filteredVideos}
                      selectedVideo={selectedVideo}
                      onVideoSelect={loadVideo}
                      directoryHandle={rootHandle}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No videos match your search.' : 'No videos found in the selected directory.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={70}>
            <div className="p-4">
              {videoLoadError && (
                <div className="p-4 text-sm text-red-800 bg-red-50 rounded-lg mb-4">
                  {videoLoadError}
                </div>
              )}
              {selectedVideo ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold truncate">
                    {selectedVideo.name}
                  </h2>
                  <VideoPlayer
                    videoFile={videoFile}
                    video={selectedVideo}
                    directoryHandle={rootHandle}
                    className="w-full"
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
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a video file to play
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}