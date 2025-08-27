'use client'

import React, { useState, useEffect } from 'react'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { markersService } from '@/services/markers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { fileSystemService, type VideoFile, type AudioFile } from '@/services/file-system'
import type { VideoMarkerState, VideoPlayerControls } from '@/types/video'
import { VideoPlayer } from './VideoPlayer'
import { YouTubePlayer } from '../youtube/YouTubePlayer'
import { AudioPlayer } from '../audio/AudioPlayer'
import { youtubeApi } from '@/services/youtube-api'
import { getAudioMetadata } from '@/services/audio-metadata'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'


type ContentType = 'local' | 'youtube' | 'audio'
type CompletionRange = typeof COMPLETION_RANGES[number]['value']
type SortOrder = 'date' | 'name' | 'completion'

const COMPLETION_RANGES = [
  { value: 'all' as const, label: 'All markers' },
  { value: '0-25' as const, label: '0-25% complete' },
  { value: '26-50' as const, label: '26-50% complete' },
  { value: '51-75' as const, label: '51-75% complete' },
  { value: '76-100' as const, label: '76-100% complete' }
] as const

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

// Helper function to format time
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Chevron icon component
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width="24"
      height="24"
    >
      <path d="M9 18L15 12L9 6" />
    </svg>
  )
}

export default function VideoSurfList(): React.ReactElement {
  const [markers, setMarkers] = useState<MarkerWithContent[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(
    markers.map(marker => marker.content.path)
  ))
  const [selectedContent, setSelectedContent] = useState<MarkerContent | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedMarkerState, setSelectedMarkerState] = useState<VideoMarkerState | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [videoControls, setVideoControls] = useState<VideoPlayerControls | null>(null)
  const directoryStore = useDirectoryStore()
  
  // Use global media store for search query and selected content persistence
  const {
    markers: { 
      searchQuery, 
      selectedContentPath, 
      selectedFile: persistedFile,
      selectedTags,
      selectedTypes,
      completionFilter,
      sortOrder,
      sortDirection
    },
    setMarkersSearchQuery,
    setMarkersSelectedContent,
    setMarkersSelectedFile,
    setMarkersSelectedTags,
    setMarkersSelectedTypes,
    setMarkersCompletionFilter,
    setMarkersSortOrder,
    setMarkersSortDirection
  } = useMediaStore()

  // Update expanded paths when markers change
  useEffect(() => {
    setExpandedPaths(new Set(markers.map(marker => marker.content.path)))
  }, [markers])

  // Effect to handle seeking when video controls become available or marker changes
  useEffect(() => {
    if (videoControls && selectedMarkerId && selectedMarkerState) {
      const marker = selectedMarkerState.markers.find(m => m.id === selectedMarkerId)
      if (marker) {
        // Small delay to ensure player is ready, especially for new content
        const timeoutId = setTimeout(() => {
          videoControls.seek(marker.startTime)
        }, 100)
        
        return () => clearTimeout(timeoutId)
      }
    }
  }, [videoControls, selectedMarkerId, selectedMarkerState])

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
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag]
    setMarkersSelectedTags(newTags)
  }

  // Filter markers by search query
  const filterBySearch = (markerState: MarkerWithContent) => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    
    // Search in content title
    const titleMatch = getContentTitle(markerState.content).toLowerCase().includes(query)
    
    // Search in annotations text and tags
    const annotationMatch = markerState.annotations.some(annotation => {
      const textMatch = annotation.text?.toLowerCase().includes(query)
      const tagMatch = annotation.tags.some(tag => tag.toLowerCase().includes(query))
      return textMatch || tagMatch
    })
    
    return titleMatch || annotationMatch
  }

  // Sort markers by selected order and direction
  const sortMarkers = (markers: MarkerWithContent[]): MarkerWithContent[] => {
    return [...markers].sort((a, b) => {
      let result = 0
      
      if (sortOrder === 'name') {
        const titleA = getContentTitle(a.content).toLowerCase()
        const titleB = getContentTitle(b.content).toLowerCase()
        result = titleA.localeCompare(titleB)
      } else if (sortOrder === 'completion') {
        // Sort by average completion degree across markers for each content
        const getCompletionScore = (markerState: MarkerWithContent) => {
          const completions = markerState.markers.map(m => m.completionDegree || 0)
          if (completions.length === 0) return 0
          const sum = completions.reduce((s, v) => s + v, 0)
          return sum / completions.length
        }
        const scoreA = getCompletionScore(a)
        const scoreB = getCompletionScore(b)
        result = scoreB - scoreA // Higher scores first by default
      } else {
        // Default: Sort by date added
        // Use the most recent marker creation time for each content
        const getDateScore = (markerState: MarkerWithContent) => {
          if (markerState.markers.length > 0) {
            // Find the most recent marker creation timestamp
            const timestamps = markerState.markers
              .map(m => m.createdAt || 0)
              .filter(t => t > 0)
            
            if (timestamps.length > 0) {
              return Math.max(...timestamps)
            }
            
            // Fallback: Use annotation timestamps if no marker timestamps
            const annotationTimestamps = markerState.annotations
              .map(a => a.timestamp || 0)
              .filter(t => t > 0)
            
            if (annotationTimestamps.length > 0) {
              return Math.max(...annotationTimestamps)
            }
          }
          return 0
        }
        
        const dateA = getDateScore(a)
        const dateB = getDateScore(b)
        result = dateB - dateA // More recent first by default
      }
      
      // Apply sort direction
      return sortDirection === 'desc' ? result : -result
    })
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

        // Load audio markers
        const audioFiles = await fileSystemService.scanForAudioFiles(rootHandle)
        for (const audio of audioFiles) {
          try {
            const metadata = await getAudioMetadata(audio, rootHandle)
            const markers = metadata.markers || []
            const annotations = metadata.annotations || []

            // Add markers whether there are annotations or not
            if (markers.length > 0) {
              allMarkers.push({
                markers: markers,
                annotations: annotations || [],
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
          } catch (error) {
            console.error('Error loading audio markers:', error)
          }
        }

        // Load YouTube markers
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
            let title = localStorage.getItem(`youtube_title_${videoId}`)
            
            if (!title) {
              await youtubeApi.ensurePlayerAPI()
              
              try {
                // Create a promise that resolves when we get the title
                const titlePromise = new Promise<string>((resolve) => {
                  const tempPlayer = new YT.Player('temp-player', {
                    videoId: videoId,
                    events: {
                      onReady: (event) => {
                        const player = event.target as any
                        const videoData = player.getVideoData()
                        const videoTitle = videoData?.title || `Video ${videoId}`
                        localStorage.setItem(`youtube_title_${videoId}`, videoTitle)
                        tempPlayer.destroy()
                        resolve(videoTitle)
                      }
                    }
                  })
                })

                // Wait for the title to be fetched with a timeout
                title = await Promise.race([
                  titlePromise,
                  new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error('Title fetch timeout')), 5000)
                  )
                ]).catch(error => {
                  console.error('Error fetching YouTube video title:', error)
                  return `Video ${videoId}` // Fallback title
                })
              } catch (error) {
                console.error('Error fetching YouTube video title:', error)
                title = `Video ${videoId}` // Fallback title
              }
            }

            // Make sure we have markers and annotations arrays
            const markers = Array.isArray(markerState.markers) ? markerState.markers : []
            const annotations = Array.isArray(markerState.annotations) ? markerState.annotations : []

            // Add markers whether there are annotations or not
            if (markers.length > 0) {
              allMarkers.push({
                markers,
                annotations: annotations || [],
                activeMarkerId: null,
                isLooping: false,
                content: {
                  type: 'youtube',
                  path: `youtube:${videoId}`,
                  youtubeId: videoId,
                  title
                }
              })
            }
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

  // Restore selected content when page loads
  useEffect(() => {
    if (selectedContentPath && markers.length > 0 && !selectedContent) {
      const markerWithContent = markers.find(m => m.content.path === selectedContentPath)
      if (markerWithContent) {
        setSelectedContent(markerWithContent.content)
        setSelectedMarkerState(markerWithContent)
        
        // Load the file if needed
        if (markerWithContent.content.type === 'local' || markerWithContent.content.type === 'audio') {
          const loadFile = async () => {
            try {
              if (!directoryStore.rootHandle) return
              // Use fileSystemService to get file handle
              const segments = markerWithContent.content.path.split('/')
              let currentHandle = directoryStore.rootHandle
              
              // Navigate to the file
              for (let i = 0; i < segments.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(segments[i])
              }
              const fileName = segments[segments.length - 1]
              const fileHandle = await currentHandle.getFileHandle(fileName)
              const file = await fileHandle.getFile()
              setSelectedFile(file)
              // Store file path for persistence
              setMarkersSelectedFile(markerWithContent.content.path)
            } catch (error) {
              console.error('Error loading file:', error)
            }
          }
          loadFile()
        }
      }
    }
  }, [selectedContentPath, markers, selectedContent, directoryStore.rootHandle])

  return (
    <>
      {/* Hidden container for temporary YouTube players */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div id="temp-player" style={{ width: '480px', height: '270px' }} />
      </div>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="min-h-screen">
        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          <div className="h-full border-r bg-muted/30">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Markers List</h2>
                <div className="flex items-center gap-2">
                  <Select
                    value={sortOrder}
                    onValueChange={(value: SortOrder) => setMarkersSortOrder(value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">By Date</SelectItem>
                      <SelectItem value="name">By Name</SelectItem>
                      <SelectItem value="completion">By Completion</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setMarkersSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
                    className="h-8 w-8"
                    title={sortDirection === 'desc' 
                      ? `${sortOrder === 'date' ? 'Newest first' : sortOrder === 'name' ? 'Z-A' : 'Highest first'} (click to reverse)`
                      : `${sortOrder === 'date' ? 'Oldest first' : sortOrder === 'name' ? 'A-Z' : 'Lowest first'} (click to reverse)`
                    }
                  >
                    {sortDirection === 'desc' ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search markers by annotation or tags..."
                  value={searchQuery}
                  onChange={(e) => setMarkersSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="space-y-4">
                {/* Completion filter */}
                <Select
                  value={completionFilter}
                  onValueChange={(value: CompletionRange) => setMarkersCompletionFilter(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by completion" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All markers</SelectItem>
                    <SelectItem value="0-25">0-25% complete</SelectItem>
                    <SelectItem value="26-50">26-50% complete</SelectItem>
                    <SelectItem value="51-75">51-75% complete</SelectItem>
                    <SelectItem value="76-100">76-100% complete</SelectItem>
                  </SelectContent>
                </Select>

                {/* Type filters */}
                <div className="flex gap-2">
                  {[
                    { type: 'local', label: 'Video' },
                    { type: 'youtube', label: 'YouTube' },
                    { type: 'audio', label: 'Audio' }
                  ].map(({ type, label }) => (
                    <button
                      key={type}
                      className={`px-2 py-1 text-sm rounded-full transition-colors ${
                        selectedTypes.includes(type as ContentType)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      onClick={() => {
                        const newTypes = selectedTypes.includes(type as ContentType)
                          ? selectedTypes.filter(t => t !== type as ContentType)
                          : [...selectedTypes, type as ContentType]
                        setMarkersSelectedTypes(newTypes)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Tag filters */}
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
                      onClick={() => setMarkersSelectedTags([])}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {/* Markers list */}
                <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
              {sortMarkers(markers
                .filter(markerState => {
                   // Filter by type
                   if (!selectedTypes.includes(markerState.content.type)) return false

                   // Filter by search query
                   if (!filterBySearch(markerState)) return false

                   // Apply tag filters only if tags are selected and markers have annotations
                   if (selectedTags.length > 0) {
                     const hasMatchingMarkers = markerState.markers.some(marker => {
                       const annotation = markerState.annotations.find(a => a.markerId === marker.id)
                       return annotation && selectedTags.every(tag => annotation.tags.includes(tag))
                     })
                     if (!hasMatchingMarkers) return false
                   }

                   // Filter by completion degree
                   if (completionFilter !== 'all') {
                     const [min, max] = completionFilter.split('-').map(Number)
                     const hasMarkersInRange = markerState.markers.some(marker => {
                       const completion = marker.completionDegree || 0
                       return completion >= min && completion <= max
                     })
                     if (!hasMarkersInRange) return false
                   }

                   return true
                 }))
                .map(markerState => {
                  // Calculate overall progress for this content
                  const totalMarkers = markerState.markers.length
                  const avgCompletion = totalMarkers > 0 
                    ? markerState.markers.reduce((sum, m) => sum + (m.completionDegree || 0), 0) / totalMarkers 
                    : 0
                  
                  return (
                  <div key={markerState.content.path} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
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
                      className="w-full hover:bg-muted/30 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ChevronIcon
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              expandedPaths.has(markerState.content.path) ? 'rotate-90' : ''
                            }`}
                          />
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                            markerState.content.type === 'youtube' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            markerState.content.type === 'audio' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            {markerState.content.type === 'youtube' ? 'YouTube' :
                             markerState.content.type === 'audio' ? 'Audio' : 'Video'}
                          </span>
                          <div className="text-left">
                            <h3 className="font-medium text-sm">{getContentTitle(markerState.content)}</h3>
                            <p className="text-xs text-muted-foreground">
                              {markerState.markers.length} marker{markerState.markers.length !== 1 ? 's' : ''} • {avgCompletion.toFixed(0)}% avg completion
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Overall completion progress bar */}
                          <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                markerState.content.type === 'youtube' ? 'bg-red-500' :
                                markerState.content.type === 'audio' ? 'bg-purple-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${avgCompletion}%` }}
                            />
                          </div>
                          <ChevronIcon
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              expandedPaths.has(markerState.content.path) ? 'rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>
                    </button>
                    {expandedPaths.has(markerState.content.path) && (
                      <div className="px-3 pb-3">
                        <div className="space-y-2">
                        {markerState.markers
                          .filter(marker => {
                             // Get annotation if it exists
                             const annotation = markerState.annotations.find(a => a.markerId === marker.id)

                             // Skip markers that are 100% complete
                             const completion = marker.completionDegree || 0
                             if (completion === 100) return false
                              
                             // Filter by completion range
                             if (completionFilter !== 'all') {
                                const [min, max] = completionFilter.split('-').map(Number)
                                if (completion < min || completion > max) return false
                             }

                             // Filter by tags only if tags are selected and marker has annotation
                             if (selectedTags.length > 0 && annotation) {
                                return selectedTags.every(tag => annotation.tags.includes(tag))
                             }

                             return true
                           })
                           .map((marker, markerIndex) => {
                             const annotation = markerState.annotations.find(a => a.markerId === marker.id)

                            // Calculate marker time and completion
                            const markerTime = markerState.content.type === 'audio'
                              ? `${formatTime(marker.startTime)} - ${formatTime(marker.endTime)}`
                              : formatTime(marker.startTime)
                            const completion = marker.completionDegree || 0

                          return (
                            <div
                              key={marker.id}
                              className={`border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors ${
                                marker.id === selectedMarkerId ? 'border-primary bg-primary/5' : ''
                              }`}
                            >
                              <button
                                className="w-full text-left p-3"
                                onClick={async () => {
                                  // If we're selecting the same content, seek immediately
                                  const isSameContent = selectedContent?.path === markerState.content.path
                                  
                                  setSelectedContent(markerState.content)
                                  setSelectedMarkerId(marker.id)
                                  setSelectedMarkerState(markerState)
                                  
                                  // Store selected content path for persistence
                                  setMarkersSelectedContent(markerState.content.path)
                                  
                                  // If same content and video controls available, seek immediately
                                  if (isSameContent && videoControls) {
                                    videoControls.seek(marker.startTime)
                                  }
                                  
                                  // If different content, load the new file first
                                  if (!isSameContent) {
                                    // First set the file to null to trigger cleanup
                                    setSelectedFile(null)
                                    
                                    // Wait a brief moment for cleanup
                                    await new Promise(resolve => setTimeout(resolve, 100))
                                    
                                    // Then load the new file
                                    if (markerState.content.file) {
                                      try {
                                        const pathParts = markerState.content.file.path.split('/')
                                        const fileName = pathParts.pop()
                                        let currentHandle = directoryStore.rootHandle
                                        
                                        for (const part of pathParts) {
                                          if (!currentHandle) break
                                          currentHandle = await currentHandle.getDirectoryHandle(part)
                                        }
                                        
                                        if (currentHandle && fileName) {
                                          const fileHandle = await currentHandle.getFileHandle(fileName)
                                          const file = await fileHandle.getFile()
                                          setSelectedFile(file)
                                        }
                                      } catch (error) {
                                        console.error('Error loading file:', error)
                                      }
                                    }
                                  }
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Marker number badge */}
                                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                    markerState.content.type === 'youtube' ? 'bg-red-500' :
                                    markerState.content.type === 'audio' ? 'bg-purple-500' :
                                    'bg-blue-500'
                                  }`}>
                                    {markerIndex + 1}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    {/* Time and title row */}
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                                        {markerTime}
                                      </span>
                                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                                        completion >= 75 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                        completion >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                        completion >= 25 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                                        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                      }`}>
                                        {completion}%
                                      </span>
                                    </div>
                                    
                                    {/* Marker title/annotation */}
                                    <div className="text-sm font-medium mb-2 line-clamp-2">
                                      {annotation?.text || 'Untitled Marker'}
                                    </div>
                                    
                                    {/* Progress bar */}
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          markerState.content.type === 'youtube' ? 'bg-red-500' :
                                          markerState.content.type === 'audio' ? 'bg-purple-500' :
                                          'bg-blue-500'
                                        }`}
                                        style={{ width: `${completion}%` }}
                                      />
                                    </div>
                                    
                                    {/* Tags */}
                                    {annotation?.tags && annotation.tags.length > 0 && (
                                      <div className="flex gap-1 flex-wrap">
                                        {annotation.tags.map(tag => (
                                          <span
                                            key={tag}
                                            className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
        
        <ResizableHandle />
        
        <ResizablePanel defaultSize={70}>
          <div className="p-6">
            {selectedContent && selectedMarkerState && (
              <div className="space-y-4">
                {/* Display content title at the top */}
                <div className="mb-2 py-2 px-3 bg-muted/50 rounded-md">
                  <h2 className="text-lg font-medium truncate">{selectedContent.title}</h2>
                </div>
                
                {selectedContent.type === 'local' && selectedFile && (
                  <VideoPlayer
                    videoFile={selectedFile}
                    video={selectedContent.file as VideoFile}
                    onControlsReady={setVideoControls}
                    directoryHandle={directoryStore.rootHandle || undefined}
                    selectedMarkerId={selectedMarkerId}
                    onMarkerSelect={setSelectedMarkerId}
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
                    selectedMarkerId={selectedMarkerId}
                    onMarkerSelect={setSelectedMarkerId}
                  />
                )}
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  )
}