'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/ui/tag-input'
import { TagList } from '@/components/ui/tag-list'
import { fileSystemService } from '@/services/file-system'
import { markersService } from '@/services/markers'
import { getAudioMetadata } from '@/services/audio-metadata'
import type { VideoFile } from '@/services/file-system'
import type { VideoMarkerState, Video, YouTubeVideo, FileSystemVideo } from '@/types/video'
import type { AudioMetadata, FileSystemAudio } from '@/types/audio'
import { useTags } from '@/hooks/useTags'
import { useDirectoryStore } from '@/stores/directory-store'
import { useYouTubeStore } from '@/stores/youtube-store'
import { Header } from '@/components/layout/Header'

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

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

export default function SearchPage() {
  const router = useRouter()
  const { rootHandle, expandToPath } = useDirectoryStore()
  const { videoCache } = useYouTubeStore()
  const { tags: availableTags } = useTags()
  const {
    searchTerm,
    selectedTags,
    searchResults: results,
    setSearchTerm,
    setSelectedTags,
    setSearchResults,
    clearSearch
  } = useYouTubeStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<(Video | FileSystemAudio)[]>([])
  const [tagCounts, setTagCounts] = useState<Array<{ tag: string, count: number }>>([])

  // Calculate tag counts from media files
  useEffect(() => {
    const counts = new Map<string, number>()
    
    mediaFiles.forEach(media => {
      if ('type' in media && (media.type === 'file' || media.type === 'youtube')) {
        // Handle video markers
        const markerState = localStorage.getItem(
          media.type === 'file'
            ? `markers_${(media as FileSystemVideo).path}`
            : `youtube_markers_${(media as YouTubeVideo).id}`
        )
        
        if (markerState) {
          try {
            const parsed = JSON.parse(markerState)
            if (parsed.annotations) {
              parsed.annotations.forEach((annotation: any) => {
                if (Array.isArray(annotation.tags)) {
                  annotation.tags.forEach((tag: string) => {
                    const normalizedTag = normalizeTag(tag)
                    counts.set(normalizedTag, (counts.get(normalizedTag) || 0) + 1)
                  })
                }
              })
            }
          } catch (err) {
            console.error('Error parsing marker state:', err)
          }
        }
      } else {
        // Handle audio metadata
        const audioMetadata = localStorage.getItem(`audio_metadata_${(media as FileSystemAudio).path}`)
        if (audioMetadata) {
          try {
            const parsed = JSON.parse(audioMetadata)
            if (Array.isArray(parsed.tags)) {
              parsed.tags.forEach((tag: string) => {
                const normalizedTag = normalizeTag(tag)
                counts.set(normalizedTag, (counts.get(normalizedTag) || 0) + 1)
              })
            }
          } catch (err) {
            console.error('Error parsing audio metadata:', err)
          }
        }
      }
    })

    setTagCounts(
      Array.from(counts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
    )
  }, [mediaFiles])

  // Clear any stale search results on mount
  useEffect(() => {
    clearSearch()
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[type="text"]')
        searchInput?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const loadVideos = async () => {
      setIsLoading(true)
      if (!rootHandle) {
        setMediaFiles([])
        setIsLoading(false)
        return
      }
      
      try {
        // Load videos
        const videoFiles = await fileSystemService.scanForVideos(rootHandle)
        const formattedVideos: Video[] = videoFiles.map(file => ({
          ...file,
          type: 'file'
        }))

        // Load YouTube videos
        const cachedVideos = Object.values(videoCache)
        if (cachedVideos.length > 0) {
          const youtubeVideos = cachedVideos
            .filter(video => {
              const stored = localStorage.getItem(`youtube_markers_${video.id}`)
              if (!stored) return false
              try {
                const parsed = JSON.parse(stored)
                return parsed &&
                  Array.isArray(parsed.markers) &&
                  Array.isArray(parsed.annotations) &&
                  parsed.markers.length > 0 &&
                  parsed.annotations.every((a: any) => a.markerId && Array.isArray(a.tags))
              } catch {
                return false
              }
            })
            .map(video => ({
              id: video.id,
              type: 'youtube' as const,
              title: video.title || 'Untitled Video'
            }))
          
          formattedVideos.push(...youtubeVideos)
        }

        // Load audio files
        const audioFiles = await fileSystemService.scanForAudioFiles(rootHandle)
        
        setMediaFiles([...formattedVideos, ...audioFiles])
      } catch (error) {
        console.error('Error loading videos:', error)
      }
      setIsLoading(false)
  }

  useEffect(() => {
    loadVideos()
  }, [rootHandle, videoCache])

  // Perform search when media files are loaded
  useEffect(() => {
    if (mediaFiles.length > 0 && (searchTerm || selectedTags.length > 0)) {
      handleSearch()
    }
  }, [mediaFiles])

  const handleSearch = async () => {
      if (!rootHandle || !mediaFiles.length) return
    setIsSearching(true)
    const searchResults: SearchResult[] = []

    try {
      const normalizedSearchTerm = searchTerm.trim().toLowerCase()
      const normalizedSearchTags = selectedTags.map(tag => tag.toLowerCase())
      const hasTextSearch = normalizedSearchTerm.length > 0
      const hasTagSearch = normalizedSearchTags.length > 0

      for (const media of mediaFiles) {
        try {
          if ('type' in media && (media.type === 'file' || media.type === 'youtube')) {
            // Handle video files
            const video = media as Video
            const defaultState: VideoMarkerState = {
              markers: [],
              annotations: [],
              activeMarkerId: null,
              isLooping: false
            }
            
            let markerState = defaultState

            if (video.type === 'file') {
              const loadedMarkers = await markersService.loadMarkers(rootHandle, (video as VideoFile).path)
              if (loadedMarkers) {
                markerState = loadedMarkers
              }
            } else {
              const videoId = (video as YouTubeVideo).id
              const stored = localStorage.getItem(`youtube_markers_${videoId}`)
              if (stored) {
                try {
                  const parsed = JSON.parse(stored)
                  if (parsed && Array.isArray(parsed.markers) && Array.isArray(parsed.annotations)) {
                    markerState = {
                      ...parsed,
                      annotations: parsed.annotations.map((a: any) => ({
                        ...a,
                        tags: a.tags.map(normalizeTag)
                      }))
                    }
                  }
                } catch (err) {
                  console.error('Error parsing YouTube markers:', err)
                }
              }
            }

            // Find markers that match either text search or all selected tags
            const matchingMarkers = markerState.markers
              .filter(marker => {
                const annotation = markerState.annotations.find(a => a.markerId === marker.id)
                if (!annotation) return false

                const textMatches = !hasTextSearch ||
                  annotation.text?.toLowerCase().includes(normalizedSearchTerm)

                // For tag search, marker must have ALL selected tags
                const tagMatches = !hasTagSearch ||
                  normalizedSearchTags.every(searchTag =>
                    annotation.tags?.some(tag => normalizeTag(tag) === searchTag)
                  )

                return textMatches && tagMatches // Using AND to require both conditions
              })
              .map(marker => {
                const annotation = markerState.annotations.find(a => a.markerId === marker.id)
                return {
                  id: marker.id,
                  startTime: marker.startTime,
                  endTime: marker.endTime,
                  text: annotation?.text,
                  tags: (annotation?.tags || []).map(normalizeTag)
                }
              })

            if (matchingMarkers.length > 0) {
              searchResults.push({
                type: 'video',
                content: video,
                matchingMarkers
              })
            }
          } else {
            // Handle audio files
            const audio = media as FileSystemAudio
            const metadata = await getAudioMetadata(audio, rootHandle)
            
            if (metadata) {
              const textMatches = !hasTextSearch ||
                metadata.title?.toLowerCase().includes(normalizedSearchTerm) ||
                metadata.tags.some(tag => tag.toLowerCase().includes(normalizedSearchTerm))
              
              // For tag search, audio must have ALL selected tags (matching video behavior)
              const tagMatches = !hasTagSearch ||
                normalizedSearchTags.every(searchTag =>
                  metadata.tags.some(tag => normalizeTag(tag) === searchTag)
                )

              if (textMatches && tagMatches) {
                searchResults.push({
                  type: 'audio',
                  content: audio,
                  matchingMarkers: []  // Audio doesn't have markers yet
                })
              }
            }
          }
        } catch (error) {
          console.error('Error processing media:', error)
        }
      }

      setSearchResults(searchResults)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 py-6 px-6">
          <div className="w-full max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
              {/* Left column - Tags */}
              <div className="md:border-r pr-6">
                <TagList
                  selectedTags={selectedTags}
                  tagCounts={tagCounts}
                  onTagClick={(tag) => {
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(selectedTags.filter(t => t !== tag))
                    } else {
                      setSelectedTags([...selectedTags, tag])
                    }
                    // Trigger search with updated tags
                    handleSearch()
                  }}
                  onTagDelete={(tag) => {
                    // If the deleted tag was selected, remove it from selection
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(selectedTags.filter(t => t !== tag))
                      handleSearch()
                    }
                  }}
                />
              </div>

              {/* Right column - Search */}
              <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Search Videos</h1>
              <div className="text-sm text-muted-foreground">
                Press <kbd className="px-2 py-1 bg-muted rounded">Ctrl K</kbd> to search
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search marker text and tags..."
                    className="flex-1 p-2 border rounded-md"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch()
                      }
                    }}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Add more tags</label>
                <TagInput
                  tags={selectedTags}
                  onTagsChange={(newTags) => {
                    setSelectedTags(newTags)
                    handleSearch()
                  }}
                  placeholder="Add tags..."
                  className="mt-1"
                />
              </div>
            </div>

            {!rootHandle ? (
              <div className="flex flex-col items-center justify-center gap-4 mb-4 p-4 bg-muted rounded">
                <p>No root directory selected</p>
                <Link 
                  href="/settings"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Go to Settings
                </Link>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                <span>Loading videos...</span>
              </div>
            ) : isSearching ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                <span>Searching videos...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Search results header */}
                {(searchTerm || selectedTags.length > 0 || results.length > 0) && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        clearSearch()
                        if (rootHandle) {
                          await loadVideos()
                        }
                      }}
                    >
                      Clear search
                    </Button>
                  </div>
                )}

                {results.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {mediaFiles.length === 0
                      ? 'No videos found in the selected directory'
                      : searchTerm.trim() || selectedTags.length > 0 
                        ? 'No videos found matching your criteria'
                        : 'Enter search terms or select tags to find videos'}
                  </div>
                ) : (
                  results.map((result) => {
                    if (!result.content) return null

                    const isVideo = result.type === 'video'
                    const content = result.content
                    let title = 'Untitled'
                    
                    if (isVideo) {
                      if (content.type === 'file') {
                        title = (content as FileSystemVideo).name || 'Untitled Video'
                      } else {
                        title = (content as YouTubeVideo).title || 'Untitled Video'
                      }
                    } else {
                      title = (content as FileSystemAudio).name || 'Untitled Audio'
                    }

                    return (
                      <div key={isVideo ? `video-${content.id}` : `audio-${content.id}`} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold flex items-center gap-2">
                            {isVideo ? (
                              <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                              </svg>
                            )}
                            {title}
                          </h2>
                        </div>

                        {isVideo && result.matchingMarkers.length > 0 && (
                          <div className="pl-4 border-l-2 space-y-3">
                            <h3 className="text-sm font-medium">Matching Markers</h3>
                            {result.matchingMarkers.map((marker) => (
                              <div key={marker.id} className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const video = content as Video
                                    if (video.type === 'file') {
                                      expandToPath((video as FileSystemVideo).path)
                                      router.push(`/?video=${encodeURIComponent((video as FileSystemVideo).path)}&marker=${marker.id}`)
                                    } else {
                                      router.push(`/youtube/${(video as YouTubeVideo).id}?marker=${marker.id}`)
                                    }
                                  }}
                                  className="text-primary"
                                >
                                  {formatTime(marker.startTime)} - {formatTime(marker.endTime)}
                                </Button>
                                <span className="text-sm">{marker.text}</span>
                                {marker.tags.length > 0 && (
                                  <div className="flex gap-1 flex-wrap">
                                    {marker.tags.map((tag: string) => (
                                      <span
                                        key={tag}
                                        className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {result.type === 'audio' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const audio = content as FileSystemAudio
                              expandToPath(audio.path)
                              router.push(`/audio?audio=${encodeURIComponent(audio.path)}`)
                            }}
                            className="text-primary"
                          >
                            Open in Player
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}