'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
import { AudioMarkers } from '@/components/audio/AudioMarkers'
import { youtubeApi } from '@/services/youtube-api'
import { getAllAudioMetadata, getAudioMetadata, saveAudioMetadata } from '@/services/audio-metadata'
import {
  fetchDevices,
  fetchPlaybackState,
  getSpotifyStatus,
  pauseSpotify,
  playSpotifyTrack,
  seekSpotify
} from '@/services/spotify'
import type { AudioAnnotation, AudioMarker } from '@/types/audio'
import { Search, ArrowUp, ArrowDown, Video as VideoIcon, Shuffle, Music2, ExternalLink, RefreshCw, Play, Pause } from 'lucide-react'
import { useTagStore } from '@/stores/tag-store'
import { cn } from '@/lib/utils'


type ContentType = 'local' | 'youtube' | 'audio' | 'spotify'
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

function getSpotifyTrackUri(contentPath: string): string | null {
  if (!contentPath.startsWith('spotify:')) return null
  let raw = contentPath.replace(/^spotify:/, '')
  if (!raw) return null

  if (raw.startsWith('https://open.spotify.com/')) {
    const match = raw.match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/)
    if (!match) return null
    return `spotify:${match[1]}:${match[2]}`
  }

  if (raw.startsWith('spotify:')) return raw
  return `spotify:${raw}`
}

function getSpotifyOpenUrl(contentPath: string): string | null {
  const uri = getSpotifyTrackUri(contentPath)
  if (!uri) return null
  const [type, id] = uri.replace(/^spotify:/, '').split(':')
  if (!type || !id) return null
  return `https://open.spotify.com/${type}/${id}`
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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  )
}

function getCompletionWeight(completion: number): number {
  const clamped = Math.max(0, Math.min(100, completion))
  return 101 - clamped
}

function getContentTypeLabel(type: ContentType): string {
  if (type === 'youtube') return 'YouTube'
  if (type === 'audio') return 'Audio'
  if (type === 'spotify') return 'Spotify'
  return 'Video'
}

function getContentBadgeClass(type: ContentType): string {
  if (type === 'youtube') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (type === 'audio') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  if (type === 'spotify') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
}

function getContentProgressClass(type: ContentType): string {
  if (type === 'youtube') return 'bg-red-500'
  if (type === 'audio') return 'bg-purple-500'
  if (type === 'spotify') return 'bg-green-500'
  return 'bg-blue-500'
}

function getContentSelectionClass(type: ContentType): string {
  if (type === 'youtube') return 'bg-red-500/10 text-red-950 dark:text-red-100'
  if (type === 'audio') return 'bg-purple-500/10 text-purple-950 dark:text-purple-100'
  if (type === 'spotify') return 'bg-green-500/10 text-green-950 dark:text-green-100'
  return 'bg-blue-500/10 text-blue-950 dark:text-blue-100'
}

function getCompletionPillClass(completion: number): string {
  if (completion >= 75) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (completion >= 50) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  if (completion >= 25) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function getMarkerTimeLabel(marker: MarkerWithContent['markers'][number]): string {
  return `${formatTime(marker.startTime)} - ${formatTime(marker.endTime)}`
}

function getMarkerTitleText(
  marker: MarkerWithContent['markers'][number],
  annotation: MarkerWithContent['annotations'][number] | undefined,
  index: number
): string {
  return marker.title?.trim() || annotation?.text?.trim() || `Marker ${index + 1}`
}

function CompactTags({ tags }: { tags: string[] }): React.ReactElement {
  if (tags.length === 0) {
    return <span className="text-[11px] text-muted-foreground">None</span>
  }

  const visibleTags = tags.slice(0, 3)
  const hiddenCount = tags.length - visibleTags.length

  return (
    <div className="flex max-w-40 flex-nowrap gap-1 overflow-hidden" title={tags.join(', ')}>
      {visibleTags.map(tag => (
        <span
          key={tag}
          className="max-w-20 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
        >
          {tag}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{hiddenCount}
        </span>
      )}
    </div>
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
  const [spotifyStatusChecked, setSpotifyStatusChecked] = useState(false)
  const [spotifyConfigured, setSpotifyConfigured] = useState(true)
  const [spotifyAuthorized, setSpotifyAuthorized] = useState(false)
  const [spotifyDevices, setSpotifyDevices] = useState<{ id: string; name: string; type: string; isActive: boolean }[]>([])
  const [spotifySelectedDeviceId, setSpotifySelectedDeviceId] = useState<string | null>(null)
  const [spotifyPlaybackState, setSpotifyPlaybackState] = useState<{
    isPlaying: boolean
    progressMs: number
    durationMs: number
    trackUri: string | null
    trackName?: string | null
    artists?: string[]
    deviceId?: string | null
  } | null>(null)
  const [spotifyStateError, setSpotifyStateError] = useState<string | null>(null)
  const [spotifyMarkerState, setSpotifyMarkerState] = useState<{
    markers: AudioMarker[]
    annotations: AudioAnnotation[]
  }>({ markers: [], annotations: [] })
  const directoryStore = useDirectoryStore()
  const setCollectedTags = useTagStore(state => state.setCollectedTags)
  
  // Use global media store for search query and selected content persistence
  const {
    markers: { 
      searchQuery, 
      selectedContentPath, 
      selectedFile: persistedFile,
      selectedTags = [],
      selectedTypes = ['local', 'youtube', 'audio', 'spotify'],
      completionFilter = 'all',
      sortOrder = 'date',
      sortDirection = 'desc'
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

  const storageHandle = directoryStore.rootHandle ?? directoryStore.audioRootHandle

  const spotifyTrackUri = useMemo(() => {
    if (selectedContent?.type !== 'spotify') return null
    return getSpotifyTrackUri(selectedContent.path)
  }, [selectedContent?.path, selectedContent?.type])

  const spotifyAudioFile = useMemo(() => {
    if (selectedContent?.type !== 'spotify') return null
    return {
      id: selectedContent.path,
      type: 'file' as const,
      name: selectedContent.title || selectedContent.path,
      path: selectedContent.path
    }
  }, [selectedContent?.path, selectedContent?.title, selectedContent?.type])

  // Update expanded paths when markers change
  useEffect(() => {
    setExpandedPaths(new Set(markers.map(marker => marker.content.path)))
  }, [markers])

  // Effect to handle seeking when video controls become available or marker changes
  useEffect(() => {
    if (selectedContent?.type === 'spotify') return
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
  }, [videoControls, selectedMarkerId, selectedMarkerState, selectedContent])

  useEffect(() => {
    if (selectedContent?.type !== 'spotify') return
    getSpotifyStatus()
      .then((status) => {
        setSpotifyConfigured(status.configured)
        setSpotifyAuthorized(status.authorized)
        if (!status.authorized) {
          setSpotifyDevices([])
          setSpotifyPlaybackState(null)
        }
        setSpotifyStatusChecked(true)
      })
      .catch(() => {
        setSpotifyConfigured(false)
        setSpotifyAuthorized(false)
        setSpotifyDevices([])
        setSpotifyPlaybackState(null)
        setSpotifyStatusChecked(true)
      })
  }, [selectedContent?.type])

  const loadSpotifyDevices = useCallback(async () => {
    if (!spotifyAuthorized) return
    try {
      const data = await fetchDevices()
      setSpotifyDevices(data)
      const active = data.find((device) => device.isActive)
      if (active) {
        setSpotifySelectedDeviceId(active.id)
      }
    } catch (err) {
      console.error(err)
    }
  }, [spotifyAuthorized])

  const loadSpotifyPlaybackState = useCallback(async () => {
    if (!spotifyAuthorized) return
    try {
      const state = await fetchPlaybackState()
      setSpotifyPlaybackState(state ? { ...state } : null)
      if (state?.deviceId) {
        setSpotifySelectedDeviceId((prev) => prev || state.deviceId)
      }
      setSpotifyStateError(null)
    } catch (err) {
      setSpotifyStateError(err instanceof Error ? err.message : 'Failed to load playback state.')
    }
  }, [spotifyAuthorized])

  useEffect(() => {
    if (selectedContent?.type !== 'spotify' || !spotifyAuthorized) return
    loadSpotifyDevices()
    loadSpotifyPlaybackState()
  }, [selectedContent?.type, spotifyAuthorized, loadSpotifyDevices, loadSpotifyPlaybackState])

  useEffect(() => {
    if (selectedContent?.type !== 'spotify' || !spotifyAuthorized) return
    const interval = setInterval(async () => {
      try {
        const state = await fetchPlaybackState()
        setSpotifyPlaybackState(state ? { ...state } : null)
        if (state?.deviceId) {
          setSpotifySelectedDeviceId((prev) => prev || state.deviceId)
        }

        if (state && spotifyMarkerState.markers.some((m) => m.isLooping)) {
          const loopingMarker = spotifyMarkerState.markers.find((m) => m.isLooping)
          if (loopingMarker && state.progressMs / 1000 >= loopingMarker.endTime) {
            await seekSpotify(loopingMarker.startTime * 1000, spotifySelectedDeviceId ?? undefined)
          }
        }
      } catch (err) {
        setSpotifyStateError(err instanceof Error ? err.message : 'Failed to load playback state.')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [selectedContent?.type, spotifyAuthorized, spotifyMarkerState.markers, spotifySelectedDeviceId])

  useEffect(() => {
    if (!spotifyAudioFile || !storageHandle || selectedContent?.type !== 'spotify') {
      setSpotifyMarkerState({ markers: [], annotations: [] })
      return
    }

    getAudioMetadata(spotifyAudioFile, storageHandle)
      .then((metadata) => {
        const nextMarkers = Array.isArray(metadata?.markers) ? metadata.markers : []
        const nextAnnotations = Array.isArray(metadata?.annotations) ? metadata.annotations : []
        setSpotifyMarkerState({
          markers: nextMarkers,
          annotations: nextAnnotations
        })
        setSelectedMarkerState((prev) => {
          if (!prev) return prev
          return { ...prev, markers: nextMarkers, annotations: nextAnnotations }
        })
      })
      .catch(() => {
        setSpotifyMarkerState({ markers: [], annotations: [] })
      })
  }, [spotifyAudioFile, storageHandle, selectedContent?.type])

  useEffect(() => {
    if (selectedContent?.type !== 'spotify' || !spotifyAuthorized || !selectedMarkerId) return
    const marker = spotifyMarkerState.markers.find((m) => m.id === selectedMarkerId)
    if (!marker) return
    seekSpotify(marker.startTime * 1000, spotifySelectedDeviceId ?? undefined).catch(() => {})
  }, [selectedContent?.type, spotifyAuthorized, selectedMarkerId, spotifyMarkerState.markers, spotifySelectedDeviceId])

  const persistSpotifyMarkerState = useCallback(
    (update: Partial<{ markers: AudioMarker[]; annotations: AudioAnnotation[] }>) => {
      const contentPath = selectedContent?.path
      setSpotifyMarkerState((prev) => {
        const next = { ...prev, ...update }

        if (contentPath) {
          setMarkers((prevEntries) =>
            prevEntries.map((entry) =>
              entry.content.path === contentPath
                ? { ...entry, markers: next.markers, annotations: next.annotations }
                : entry
            )
          )
        }

        setSelectedMarkerState((prevSelected) => {
          if (!prevSelected) return prevSelected
          return { ...prevSelected, markers: next.markers, annotations: next.annotations }
        })

        if (selectedMarkerId && !next.markers.find((m) => m.id === selectedMarkerId)) {
          setSelectedMarkerId(null)
        }

        if (spotifyAudioFile && storageHandle) {
          saveAudioMetadata(
            spotifyAudioFile,
            {
              markers: next.markers,
              annotations: next.annotations,
              title: spotifyAudioFile.name
            },
            storageHandle
          ).catch((error) => {
            console.error('Failed to save Spotify markers:', error)
          })
        }

        return next
      })
    },
    [selectedContent?.path, selectedMarkerId, spotifyAudioFile, storageHandle]
  )

  // Collect all unique tags from annotations using useMemo to prevent recalculation
  const allTags = useMemo(() => {
    return Array.from(new Set(
      markers.flatMap(m => m.annotations.flatMap(a => a.tags))
    )).sort()
  }, [markers])

  // Update global tag store whenever markers change
  useEffect(() => {
    if (allTags.length > 0) {
      setCollectedTags(allTags)
    }
  }, [allTags, setCollectedTags])

  // Generate title for content
  const getContentTitle = (content: MarkerContent) => {
    switch (content.type) {
      case 'local':
      case 'audio':
        return content.file?.name || 'Untitled'
      case 'spotify':
        return content.title || 'Spotify Track'
      case 'youtube':
        return content.title || 'YouTube Video'
    }
  }

  // Filter markers by search query
  const filterBySearch = useCallback((markerState: MarkerWithContent) => {
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
  }, [searchQuery])

  const filteredMarkerStates = useMemo(() => {
    return markers.filter(markerState => {
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
    })
  }, [markers, selectedTypes, selectedTags, completionFilter, filterBySearch])

  const getVisibleMarkers = useCallback((markerState: MarkerWithContent) => {
    return markerState.markers.filter(marker => {
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
  }, [completionFilter, selectedTags])

  const selectableMarkers = useMemo(() => {
    return filteredMarkerStates.flatMap(markerState =>
      getVisibleMarkers(markerState).map(marker => ({ markerState, marker }))
    )
  }, [filteredMarkerStates, getVisibleMarkers])

  const selectMarker = useCallback(async (markerState: MarkerWithContent, marker: MarkerWithContent['markers'][number]) => {
    const isSameContent = selectedContent?.path === markerState.content.path

    setSelectedContent(markerState.content)
    setSelectedMarkerId(marker.id)
    setSelectedMarkerState(markerState)
    setMarkersSelectedContent(markerState.content.path)
    setExpandedPaths(prev => {
      if (prev.has(markerState.content.path)) return prev
      const next = new Set(prev)
      next.add(markerState.content.path)
      return next
    })

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
  }, [directoryStore.rootHandle, selectedContent?.path, setMarkersSelectedContent, videoControls])

  const handleRandomMarker = useCallback(async () => {
    if (selectableMarkers.length === 0) return

    const totalWeight = selectableMarkers.reduce((sum, entry) => {
      return sum + getCompletionWeight(entry.marker.completionDegree || 0)
    }, 0)

    let roll = Math.random() * totalWeight
    const chosen = selectableMarkers.find(entry => {
      roll -= getCompletionWeight(entry.marker.completionDegree || 0)
      return roll <= 0
    }) || selectableMarkers[selectableMarkers.length - 1]

    await selectMarker(chosen.markerState, chosen.marker)
  }, [selectMarker, selectableMarkers])

  // Handle tag selection/deselection
  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag]
    setMarkersSelectedTags(newTags)
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
      const rootHandle = directoryStore.rootHandle ?? directoryStore.audioRootHandle
      if (!rootHandle) return

      try {
        const allMarkers: MarkerWithContent[] = []

        // Load local video markers
        const videos = await fileSystemService.scanForVideos(rootHandle)
        for (const video of videos) {
          const file = video.handle ? await video.handle.getFile() : null
          const markerState = file
            ? await markersService.loadMarkersForFile(rootHandle, video.path, file)
            : await markersService.loadMarkers(rootHandle, video.path)
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

        // Load Spotify markers stored in audio metadata
        try {
          const metadataHandle = storageHandle ?? rootHandle
          if (!metadataHandle) {
            throw new Error('Missing storage handle for Spotify metadata.')
          }
          const metadataMap = await getAllAudioMetadata(metadataHandle)
          for (const metadata of Object.values(metadataMap)) {
            if (!metadata.path?.startsWith('spotify:')) continue
            const markers = Array.isArray(metadata.markers) ? metadata.markers : []
            const annotations = Array.isArray(metadata.annotations) ? metadata.annotations : []
            if (markers.length > 0) {
              allMarkers.push({
                markers,
                annotations,
                activeMarkerId: null,
                isLooping: false,
                content: {
                  type: 'spotify',
                  path: metadata.path,
                  title: metadata.title || metadata.path
                }
              })
            }
          }
        } catch (error) {
          console.error('Error loading Spotify markers:', error)
        }

        // Load YouTube markers
        const youtubeRecords = await markersService.loadAllMarkers(rootHandle, 'youtube')
        for (const record of youtubeRecords) {
          try {
            const videoId = record.contentPath.replace('youtube:', '')
            if (!videoId) continue

            let title = localStorage.getItem(`youtube_title_${videoId}`)

            if (!title) {
              await youtubeApi.ensurePlayerAPI()

              try {
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

                title = await Promise.race([
                  titlePromise,
                  new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error('Title fetch timeout')), 5000)
                  )
                ]).catch(error => {
                  console.error('Error fetching YouTube video title:', error)
                  return `Video ${videoId}`
                })
              } catch (error) {
                console.error('Error fetching YouTube video title:', error)
                title = `Video ${videoId}`
              }
            }

            const markers = Array.isArray(record.markerState.markers) ? record.markerState.markers : []
            const annotations = Array.isArray(record.markerState.annotations) ? record.markerState.annotations : []

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
  }, [storageHandle])

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

  const spotifyOpenUrl = selectedContent?.type === 'spotify'
    ? getSpotifyOpenUrl(selectedContent.path)
    : null

  const spotifyAudioControls = useMemo(() => {
    if (selectedContent?.type !== 'spotify') return null
    return {
      getCurrentTime: () => (spotifyPlaybackState?.progressMs || 0) / 1000,
      getDuration: () => (spotifyPlaybackState?.durationMs || 0) / 1000,
      seek: (time: number) => {
        if (!spotifyAuthorized) return
        seekSpotify(time * 1000, spotifySelectedDeviceId ?? undefined).catch(() => {})
      },
      play: () => {
        if (!spotifyAuthorized || !spotifyTrackUri) return
        playSpotifyTrack(spotifyTrackUri, spotifySelectedDeviceId ?? undefined).catch(() => {})
      }
    }
  }, [selectedContent?.type, spotifyAuthorized, spotifyPlaybackState?.durationMs, spotifyPlaybackState?.progressMs, spotifySelectedDeviceId, spotifyTrackUri])

  return (
    <>
      {/* Hidden container for temporary YouTube players */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div id="temp-player" style={{ width: '480px', height: '270px' }} />
      </div>

      {/* Main content */}
      <div className="flex h-full min-h-0 flex-col">
        <main className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full min-h-0 flex flex-col overflow-hidden border-r bg-muted/30">
                <div className="p-3 space-y-3 flex-shrink-0 border-b bg-background/80">
                  {/* Header Section */}
                  <div className="rounded-md border bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                          <VideoIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Markers</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {markers.length} content{markers.length !== 1 ? 's' : ''} with markers
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRandomMarker}
                          disabled={selectableMarkers.length === 0}
                          className="h-7 px-2 text-xs bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                          title="Pick a weighted random marker"
                        >
                          <Shuffle className="h-3.5 w-3.5 mr-1" />
                          Random
                        </Button>
                        <Select
                          value={sortOrder}
                          onValueChange={(value: SortOrder) => setMarkersSortOrder(value)}
                        >
                          <SelectTrigger className="h-7 w-28 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-xs">
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
                          className="h-7 w-7 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                          title={sortDirection === 'desc' 
                            ? `${sortOrder === 'date' ? 'Newest first' : sortOrder === 'name' ? 'Z-A' : 'Highest first'} (click to reverse)`
                            : `${sortOrder === 'date' ? 'Oldest first' : sortOrder === 'name' ? 'A-Z' : 'Lowest first'} (click to reverse)`
                          }
                        >
                          {sortDirection === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Search Box */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search markers by annotation or tags..."
                      value={searchQuery}
                      onChange={(e) => setMarkersSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>

                  {/* Filters */}
                  <div className="space-y-3">
                    {/* Completion filter */}
                    <Select
                      value={completionFilter}
                      onValueChange={(value: CompletionRange) => setMarkersCompletionFilter(value)}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
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
                    <div className="flex gap-1.5">
                      {[
                        { type: 'local', label: 'Video' },
                        { type: 'youtube', label: 'YouTube' },
                        { type: 'audio', label: 'Audio' },
                        { type: 'spotify', label: 'Spotify' }
                      ].map(({ type, label }) => (
                        <button
                          key={type}
                          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
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
                    <div className="flex flex-wrap gap-1">
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
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
                        <span className="text-xs text-muted-foreground">Active filters:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedTags.map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setMarkersSelectedTags([])}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3">
                <div className="space-y-3">
                  {sortMarkers(filteredMarkerStates).map(markerState => {
                    const totalMarkers = markerState.markers.length
                    const avgCompletion = totalMarkers > 0
                      ? markerState.markers.reduce((sum, m) => sum + (m.completionDegree || 0), 0) / totalMarkers
                      : 0
                    const visibleMarkers = getVisibleMarkers(markerState)
                    const isExpanded = expandedPaths.has(markerState.content.path)
                    const contentType = markerState.content.type

                    return (
                      <div
                        key={markerState.content.path}
                        className="overflow-hidden rounded-md border bg-background"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedPaths(prev => {
                            const next = new Set(prev)
                            if (prev.has(markerState.content.path)) {
                              next.delete(markerState.content.path)
                            } else {
                              next.add(markerState.content.path)
                            }
                            return next
                          })}
                          className={cn(
                            'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/45',
                            isExpanded && 'border-b'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ChevronIcon
                              className={cn(
                                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                isExpanded && 'rotate-90'
                              )}
                            />
                            <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium', getContentBadgeClass(contentType))}>
                              {getContentTypeLabel(contentType)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-foreground">
                                {getContentTitle(markerState.content)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {visibleMarkers.length} shown / {totalMarkers} total
                              </div>
                            </div>
                          </div>

                          <div className="flex w-24 items-center gap-2">
                            <span className="w-8 text-right text-[11px] font-medium text-muted-foreground">
                              {avgCompletion.toFixed(0)}%
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full transition-all duration-300', getContentProgressClass(contentType))}
                                style={{ width: `${avgCompletion}%` }}
                              />
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] table-fixed text-xs">
                              <thead className="border-b bg-muted/35 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="w-12 px-3 py-2">#</th>
                                  <th className="w-32 px-3 py-2">Time</th>
                                  <th className="px-3 py-2">Title</th>
                                  <th className="w-24 px-3 py-2 text-right">Progress</th>
                                  <th className="w-40 px-3 py-2">Tags</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {visibleMarkers.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                      No visible markers match the current filters.
                                    </td>
                                  </tr>
                                ) : (
                                  visibleMarkers.map((marker, markerIndex) => {
                                    const annotation = markerState.annotations.find(a => a.markerId === marker.id)
                                    const completion = marker.completionDegree || 0
                                    const markerTitle = getMarkerTitleText(marker, annotation, markerIndex)
                                    const hasNotePreview = Boolean(annotation?.text && marker.title?.trim())

                                    return (
                                      <tr
                                        key={marker.id}
                                        className={cn(
                                          'cursor-pointer transition-colors hover:bg-muted/45',
                                          marker.id === selectedMarkerId && getContentSelectionClass(contentType)
                                        )}
                                        onClick={() => {
                                          void selectMarker(markerState, marker)
                                        }}
                                      >
                                        <td className="px-3 py-2 align-middle">
                                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold text-white', getContentProgressClass(contentType))}>
                                            {markerIndex + 1}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                          <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 font-medium tabular-nums text-foreground">
                                            <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {getMarkerTimeLabel(marker)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                          <div className="truncate font-medium text-foreground">{markerTitle}</div>
                                          {hasNotePreview && (
                                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                              {annotation?.text}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 align-middle text-right">
                                          <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold', getCompletionPillClass(completion))}>
                                            {completion}%
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                          <CompactTags tags={annotation?.tags ?? []} />
                                        </td>
                                      </tr>
                                    )
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
        </ResizablePanel>
        
        <ResizableHandle />
        
        <ResizablePanel defaultSize={70}>
          <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-6">
            {selectedContent && selectedMarkerState && (
              <div className="space-y-4">
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
                {selectedContent.type === 'spotify' && (
                  <div className="space-y-4">
                    {!spotifyConfigured && spotifyStatusChecked && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Spotify is not configured. Add your client ID/secret in `.env.local` and restart.
                      </div>
                    )}
                    {!spotifyAuthorized && spotifyStatusChecked && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        <div className="flex items-center justify-between gap-3">
                          <span>Spotify account not connected.</span>
                          <Button asChild size="sm" variant="default">
                            <a href="/api/spotify/auth?redirect=/markers">Connect Spotify</a>
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">Spotify Device & Playback (Premium required)</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            loadSpotifyDevices()
                            loadSpotifyPlaybackState()
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>

                      {spotifyDevices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No active devices reported. Open Spotify on a device and press refresh.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Target device</label>
                          <select
                            value={spotifySelectedDeviceId ?? ''}
                            onChange={(e) => setSpotifySelectedDeviceId(e.target.value || null)}
                            className="w-full rounded-md border border-input/80 bg-gradient-to-b from-white to-muted/20 px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow,background-color] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:from-input/80 dark:to-input/40"
                          >
                            <option value="">Use active device</option>
                            {spotifyDevices.map((device) => (
                              <option key={device.id} value={device.id}>
                                {device.name} {device.isActive ? '(active)' : ''} - {device.type}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {spotifyStateError && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {spotifyStateError}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!spotifyTrackUri || !spotifyAuthorized}
                          onClick={async () => {
                            if (!spotifyTrackUri) return
                            try {
                              await playSpotifyTrack(spotifyTrackUri, spotifySelectedDeviceId ?? undefined)
                              await loadSpotifyPlaybackState()
                            } catch (err) {
                              setSpotifyStateError(err instanceof Error ? err.message : 'Failed to start playback.')
                            }
                          }}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Play on Spotify
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!spotifyAuthorized}
                          onClick={async () => {
                            try {
                              await pauseSpotify(spotifySelectedDeviceId ?? undefined)
                              await loadSpotifyPlaybackState()
                            } catch (err) {
                              setSpotifyStateError(err instanceof Error ? err.message : 'Failed to pause playback.')
                            }
                          }}
                          className="gap-2"
                        >
                          <Pause className="h-4 w-4" />
                          Pause
                        </Button>
                      </div>

                      {spotifyPlaybackState && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{spotifyPlaybackState.trackName || getContentTitle(selectedContent)}</span>
                            <span>
                              {Math.floor(spotifyPlaybackState.progressMs / 1000)}s /{' '}
                              {Math.floor(spotifyPlaybackState.durationMs / 1000)}s
                            </span>
                          </div>
                          <Input
                            type="range"
                            min={0}
                            max={spotifyPlaybackState.durationMs || 0}
                            step={500}
                            value={spotifyPlaybackState.progressMs}
                            onChange={(e) => {
                              const next = Number(e.target.value)
                              setSpotifyPlaybackState((prev) => (prev ? { ...prev, progressMs: next } : prev))
                            }}
                            onMouseUp={async (e) => {
                              const next = Number((e.target as HTMLInputElement).value)
                              await seekSpotify(next, spotifySelectedDeviceId ?? undefined)
                              await loadSpotifyPlaybackState()
                            }}
                            onTouchEnd={async (e) => {
                              const next = Number((e.target as HTMLInputElement).value)
                              await seekSpotify(next, spotifySelectedDeviceId ?? undefined)
                              await loadSpotifyPlaybackState()
                            }}
                          />
                          <div className="text-xs text-muted-foreground">
                            Playback state is read from Spotify; speed control is not available via the API.
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <Music2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Spotify Track</div>
                          <div className="text-xs text-muted-foreground">Markers stored from the Spotify page.</div>
                        </div>
                      </div>
                      <div className="text-base font-medium">{getContentTitle(selectedContent)}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="default">
                          <a href="/spotify">Open Spotify Page</a>
                        </Button>
                        {spotifyOpenUrl && (
                          <Button asChild size="sm" variant="outline">
                            <a href={spotifyOpenUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1 h-4 w-4" />
                              Open in Spotify
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">Markers & Notes</div>
                        <div className="text-xs text-muted-foreground">
                          Markers loop by seeking on your Spotify device. Recording uses your microphone locally.
                        </div>
                      </div>
                      {spotifyAudioControls && (
                        <AudioMarkers
                          audioControls={spotifyAudioControls}
                          markers={spotifyMarkerState.markers}
                          annotations={spotifyMarkerState.annotations}
                          onMarkersChange={(next) => persistSpotifyMarkerState({ markers: next })}
                          onAnnotationsChange={(next) => persistSpotifyMarkerState({ annotations: next })}
                          externalActiveMarkerId={selectedMarkerId ?? undefined}
                          onActiveMarkerIdChange={setSelectedMarkerId}
                          className="mb-4"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      </main>
    </div>
    </>
  )
}
