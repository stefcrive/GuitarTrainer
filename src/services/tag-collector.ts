'use client'

import { markersService } from './markers'
import { getAudioMetadata } from './audio-metadata'
import { fileSystemService } from './file-system'
import type { VideoMarkerState } from '@/types/video'

export class TagCollectorService {
  /**
   * Collect all tags from all sources: localStorage, video markers, audio metadata, YouTube markers
   */
  static async collectAllTags(rootHandle?: FileSystemDirectoryHandle): Promise<string[]> {
    const allTags = new Set<string>()

    try {
      // 1. Get tags from localStorage (saved tags)
      const savedTags = localStorage.getItem('savedTags')
      if (savedTags) {
        const parsed = JSON.parse(savedTags) as string[]
        parsed.forEach(tag => allTags.add(tag))
      }

      // 2. Get tags from YouTube markers
      const youtubeStorageKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('youtube_markers_') ||
        key.startsWith('markers_youtube_') ||
        key.startsWith('markers-youtube-')
      )

      for (const key of youtubeStorageKeys) {
        try {
          const stored = localStorage.getItem(key)
          if (stored) {
            const markerState = JSON.parse(stored) as VideoMarkerState
            if (markerState.annotations) {
              markerState.annotations.forEach(annotation => {
                annotation.tags?.forEach(tag => allTags.add(tag))
              })
            }
          }
        } catch (error) {
          console.warn('Error reading YouTube markers from', key, error)
        }
      }

      // 3. Get tags from local video and audio files (if rootHandle provided)
      if (rootHandle) {
        try {
          // Get video markers
          const videos = await fileSystemService.scanForVideos(rootHandle)
          for (const video of videos) {
            try {
              const markerState = await markersService.loadMarkers(rootHandle, video.path)
              if (markerState?.annotations) {
                markerState.annotations.forEach(annotation => {
                  annotation.tags?.forEach(tag => allTags.add(tag))
                })
              }
            } catch (error) {
              console.warn('Error loading video markers for', video.path, error)
            }
          }

          // Get audio markers
          const audioFiles = await fileSystemService.scanForAudioFiles(rootHandle)
          for (const audio of audioFiles) {
            try {
              const metadata = await getAudioMetadata(audio, rootHandle)
              if (metadata.annotations) {
                metadata.annotations.forEach(annotation => {
                  annotation.tags?.forEach(tag => allTags.add(tag))
                })
              }
            } catch (error) {
              console.warn('Error loading audio markers for', audio.path, error)
            }
          }
        } catch (error) {
          console.warn('Error scanning for files:', error)
        }
      }

      // 4. Get tags from any other localStorage keys that might contain markers
      const allLocalStorageKeys = Object.keys(localStorage)
      for (const key of allLocalStorageKeys) {
        if (key.includes('marker') || key.includes('annotation')) {
          try {
            const stored = localStorage.getItem(key)
            if (stored) {
              const parsed = JSON.parse(stored)
              // Check if it looks like marker data with annotations
              if (parsed && Array.isArray(parsed.annotations)) {
                parsed.annotations.forEach((annotation: any) => {
                  if (annotation.tags && Array.isArray(annotation.tags)) {
                    annotation.tags.forEach((tag: string) => allTags.add(tag))
                  }
                })
              }
            }
          } catch (error) {
            // Ignore parsing errors for non-marker data
          }
        }
      }

    } catch (error) {
      console.error('Error collecting tags:', error)
    }

    const result = Array.from(allTags).filter(tag => tag && tag.trim()).sort()
    console.log('TagCollectorService - Collected all tags:', result)
    return result
  }

  /**
   * Collect tags from current session annotations (faster, synchronous)
   */
  static collectSessionTags(annotations: Array<{ tags: string[] }>): string[] {
    const tags = Array.from(new Set(annotations.flatMap(a => a.tags || []))).sort()
    console.log('TagCollectorService - Session tags:', tags)
    return tags
  }
}