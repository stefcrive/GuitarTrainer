'use client'

import React, { useState, useEffect } from 'react'
import { useDirectoryStore } from '@/stores/directory-store'
import { markersService } from '@/services/markers'
import { fileSystemService, type VideoFile, type AudioFile } from '@/services/file-system'
import type { VideoMarkerState, VideoPlayerControls } from '@/types/video'
import { VideoPlayer } from './VideoPlayer'
import { YouTubePlayer } from '../youtube/YouTubePlayer'
import { AudioPlayer } from '../audio/AudioPlayer'
import { VideoMarkers } from './VideoMarkers'
import { youtubeApi, type YouTubeVideoInfo } from '@/services/youtube-api'
import { getAudioMetadata } from '@/services/audio-metadata'

type ContentType = 'local' | 'youtube' | 'audio'

interface MarkerContent {
  type: ContentType
  path: string
  title: string
  file?: VideoFile | AudioFile
  youtubeId?: string
}

interface MarkerWithContent extends VideoMarkerState {
  content: MarkerContent
}

export default function VideoSurfList(): React.ReactElement {
  const [markers, setMarkers] = useState<MarkerWithContent[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(
    markers.map(marker => marker.content.path)
  ))

  // Update expanded paths when markers change
  useEffect(() => {
    setExpandedPaths(new Set(markers.map(marker => marker.content.path)))
  }, [markers])
  const [selectedContent, setSelectedContent] = useState<MarkerContent | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedMarkerState, setSelectedMarkerState] = useState<VideoMarkerState | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(['local', 'youtube', 'audio'])
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)
  const directoryStore = useDirectoryStore()

  // Collect all unique tags from annotations
  const allTags = Array.from(new Set(
    markers.flatMap(m => m.annotations.flatMap(a => a.tags))
  )).sort()

  // Generate title for content
  const getContentTitle = (content: MarkerContent) => {
    switch (content.type) {
      case 'local':
      case 'audio':
        return content.file?.name || 'Untitled'
      case 'youtube':
        return content.title || 'YouTube Video'
    }
  }

  // Handle tag selection/deselection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  // Load all markers from all content types
  useEffect(() => {
    async function loadAllMarkers() {
      const rootHandle = directoryStore.rootHandle
      if (!rootHandle) return

      try {
        const allMarkers: MarkerWithContent[] = []

        // Load local video markers
        const videos = await fileSystemService.scanForVideos(rootHandle)
        for (const video of videos) {
          const markerState = await markersService.loadMarkers(rootHandle, video.path)
          if (markerState && markerState.markers.length > 0) {
            allMarkers.push({
              ...markerState,
              content: {
                type: 'local',
                path: video.path,
                file: video,
                title: video.name
              }
            })
          }
        }

        // Load audio markers and tags
        const audioFiles = await fileSystemService.scanForAudioFiles(rootHandle)
        for (const audio of audioFiles) {
          try {
            const metadata = await getAudioMetadata(audio, rootHandle)
            const markers = metadata.markers || []
            const annotations = metadata.annotations || []

            if (markers.length > 0) {
              const convertedMarkers = markers.map(marker => ({
                id: marker.id,
                startTime: marker.startTime,
                endTime: marker.endTime,
                isLooping: marker.isLooping || false,
                isRecording: marker.isRecording,
                audioBlob: marker.audioBlob
              }))

              if (convertedMarkers.length > 0) {
                allMarkers.push({
                  markers: convertedMarkers,
                  annotations: annotations,
                  activeMarkerId: null,
                  isLooping: false,
                  content: {
                    type: 'audio',
                    path: audio.path,
                    file: audio,
                    title: metadata.title || audio.name
                  }
                })
              }
            }
          } catch (error) {
            console.error('Error loading audio markers:', error)
          }
        }

        // Load YouTube markers from localStorage
        const youtubeStorageKeys = Object.keys(localStorage).filter(key =>
          key.startsWith('youtube_markers_') ||
          key.startsWith('markers_youtube_') ||
          key.startsWith('markers-youtube-')
        )

        for (const key of youtubeStorageKeys) {
          try {
            const stored = localStorage.getItem(key)
            if (!stored) continue

            const markerState = JSON.parse(stored) as VideoMarkerState
            if (!markerState || !Array.isArray(markerState.markers) || !markerState.markers.length) continue

            // Extract video ID from storage key
            const videoId = key.replace(/^(youtube_markers_|markers_youtube_|markers-youtube-)/, '')
            
            // Get the video title from YouTube API
            const storedTitle = localStorage.getItem(`youtube_title_${videoId}`)
            if (!storedTitle) {
              await youtubeApi.ensurePlayerAPI()
              if (window.YT?.Player) {
                try {
                  await new Promise<void>((resolve) => {
                    const player = new window.YT.Player('temp-player', {
                      videoId,
                      playerVars: {
                        controls: 0,
                        modestbranding: 1
                      },
                      events: {
                        onReady: (event) => {
                          try {
                            // Access player data using the correct property
                            const playerInfo = (event.target as any).playerInfo
                            const videoData = playerInfo?.videoData
                            const title = videoData?.title
                            
                            if (title) {
                              localStorage.setItem(`youtube_title_${videoId}`, title)
                              // Update marker in the list if it was already added
                              setMarkers(prev => prev.map(m =>
                                m.content.type === 'youtube' && m.content.youtubeId === videoId
                                  ? { ...m, content: { ...m.content, title } }
                                  : m
                              ))
                            }
                          } catch (error) {
                            console.error('Error getting video title:', error)
                          } finally {
                            // Always clean up the player
                            setTimeout(() => {
                              event.target.destroy()
                              resolve()
                            }, 100)
                          }
                        },
                        onError: () => {
                          resolve() // Resolve on error so we don't block
                        }
                      }
                    })
                  })
                } catch (error) {
                  console.error('Error initializing temp player:', error)
                }
              }
            }

            // Use stored title or temp ID while loading
            const title = localStorage.getItem(`youtube_title_${videoId}`) || 'Loading...'

            allMarkers.push({
              ...markerState,
              content: {
                type: 'youtube',
                path: `youtube:${videoId}`,
                youtubeId: videoId,
                title
              }
            })
          } catch (error) {
            console.error('Error loading YouTube markers:', error)
          }
        }

        setMarkers(allMarkers)
      } catch (error) {
        console.error('Error loading markers:', error)
      }
    }

    loadAllMarkers()
  }, [directoryStore.rootHandle])

  // Load selected file
  useEffect(() => {
    async function loadFile() {
      if (!selectedContent?.file?.handle) return
      try {
        const file = await selectedContent.file.handle.getFile()
        setSelectedFile(file)
      } catch (error) {
        console.error('Error loading file:', error)
      }
    }

    loadFile()
  }, [selectedContent])

  // Save markers when they change
  useEffect(() => {
    async function saveMarkers() {
      if (!selectedContent || !selectedMarkerState || !directoryStore.rootHandle) return

      await markersService.saveMarkers(
        directoryStore.rootHandle,
        selectedContent.path,
        selectedMarkerState
      )
    }

    saveMarkers()
  }, [selectedContent, selectedMarkerState, directoryStore.rootHandle])

  // Seek to selected marker position when controls are ready
  useEffect(() => {
    if (!videoControls || !selectedMarkerId || !selectedMarkerState) return

    const marker = selectedMarkerState.markers.find(m => m.id === selectedMarkerId)
    if (marker) {
      videoControls.seek(marker.startTime)
    }
  }, [videoControls, selectedMarkerId, selectedMarkerState])

  return (
    <>
      {/* Hidden container for temporary YouTube players */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div id="temp-player" style={{ width: '480px', height: '270px' }} />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-[400px_1fr] gap-6">
      <div className="space-y-2">
        {/* Type filters */}
        <div className="flex gap-2">
          <button
            className={`px-2 py-1 text-sm rounded-full transition-colors ${
              selectedTypes.includes('local')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
            onClick={() => setSelectedTypes(prev =>
              prev.includes('local')
                ? prev.filter(t => t !== 'local')
                : [...prev, 'local']
            )}
          >
            Video
          </button>
          <button
            className={`px-2 py-1 text-sm rounded-full transition-colors ${
              selectedTypes.includes('youtube')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
            onClick={() => setSelectedTypes(prev =>
              prev.includes('youtube')
                ? prev.filter(t => t !== 'youtube')
                : [...prev, 'youtube']
            )}
          >
            YouTube
          </button>
          <button
            className={`px-2 py-1 text-sm rounded-full transition-colors ${
              selectedTypes.includes('audio')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
            onClick={() => setSelectedTypes(prev =>
              prev.includes('audio')
                ? prev.filter(t => t !== 'audio')
                : [...prev, 'audio']
            )}
          >
            Audio
          </button>
        </div>
        {/* Tag filter */}
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2 py-1 text-sm rounded-full transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Selected tags */}
        {selectedTags.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            <div className="flex flex-wrap gap-1">
              {selectedTags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={() => setSelectedTags([])}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Markers list */}
        <div className="space-y-1.5">
          {markers
            .filter(markerState => selectedTypes.includes(markerState.content.type))
            .map((markerState) => (
            <div key={markerState.content.path} className="border rounded p-2">
              <button
                onClick={() => setExpandedPaths(prev => {
                  const newSet = new Set(prev)
                  if (prev.has(markerState.content.path)) {
                    newSet.delete(markerState.content.path)
                  } else {
                    newSet.add(markerState.content.path)
                  }
                  return newSet
                })}
                className="w-full hover:bg-muted/50 rounded p-1 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                  <ChevronIcon
                    className={`h-4 w-4 transition-transform ${
                      expandedPaths.has(markerState.content.path) ? 'rotate-90' : ''
                    }`}
                  />
                <span className={`px-2 py-0.5 text-xs rounded ${
                  markerState.content.type === 'youtube' ? 'bg-red-100 text-red-700' :
                  markerState.content.type === 'audio' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {markerState.content.type === 'youtube' ? 'YouTube' :
                   markerState.content.type === 'audio' ? 'Audio' : 'Video'}
                </span>
                <h3 className="font-medium">{getContentTitle(markerState.content)}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {markerState.annotations.length} marker{markerState.annotations.length !== 1 ? 's' : ''}
                  </span>
                  <ChevronIcon
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      expandedPaths.has(markerState.content.path) ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </div>
              </button>
              {expandedPaths.has(markerState.content.path) && markerState.annotations
                .filter(annotation =>
                  selectedTags.length === 0 ||
                  selectedTags.every(tag => annotation.tags.includes(tag))
                )
                .map((annotation) => {
                const marker = markerState.markers.find(m => m.id === annotation.markerId)
                if (!marker) return null

                const markerTime = markerState.content.type === 'audio'
                  ? `${formatTime(marker.startTime)} - ${formatTime(marker.endTime)}`
                  : formatTime(marker.startTime)

                return (
                  <button
                    key={annotation.id}
                    className={`w-full text-left py-1 px-2 hover:bg-muted rounded group text-sm ${
                      marker.id === selectedMarkerId ? 'bg-muted' : ''
                    }`}
                    onClick={() => {
                      setSelectedContent(markerState.content)
                      setSelectedMarkerState(markerState)
                      setSelectedMarkerId(marker.id)
                    }}
                  >
                    <div className="text-xs text-muted-foreground">
                      {markerTime}
                    </div>
                    <div>{annotation.text}</div>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {annotation.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-1 py-0.5 bg-primary/10 text-primary text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Content player */}
      <div>
        {selectedContent && selectedMarkerState && (
          <div className="space-y-4">
            {selectedContent.type === 'local' && selectedFile && (
              <VideoPlayer
                videoFile={selectedFile}
                video={selectedContent.file as VideoFile}
                onControlsReady={setVideoControls}
                directoryHandle={directoryStore.rootHandle || undefined}
              />
            )}
            {selectedContent.type === 'youtube' && selectedContent.youtubeId && (
              <YouTubePlayer
                videoId={selectedContent.youtubeId}
                onControlsReady={setVideoControls}
                className="aspect-video w-full"
              />
            )}
            {selectedContent.type === 'audio' && selectedFile && (
              <AudioPlayer
                audioFile={selectedContent.file as AudioFile}
                onControlsReady={setVideoControls}
              />
            )}
          </div>
        )}
      </div>
      </div>
    </>
  )
}

// Chevron icon component
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 6L15 12L9 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}