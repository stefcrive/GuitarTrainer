import { useState, useEffect, useCallback } from 'react'
import type { VideoMarkerState } from '@/types/video'
import { markersService } from '@/services/markers'
import { useDirectoryStore } from '@/stores/directory-store'

const EMPTY_STATE: VideoMarkerState = {
  markers: [],
  annotations: [],
  activeMarkerId: null,
  isLooping: false
}

export function useVideoMarkers(videoPath: string) {
  const rootHandle = useDirectoryStore((state) => state.rootHandle)
  const [markerState, setInternalMarkerState] = useState<VideoMarkerState>(EMPTY_STATE)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load markers when videoPath changes
  useEffect(() => {
    const loadMarkers = async () => {
      setIsLoaded(false)

      // Handle YouTube videos differently
      if (videoPath.startsWith('youtube:')) {
        const videoId = videoPath.replace('youtube:', '')
        const storageKeys = [
          `youtube_markers_${videoId}`,
          `markers_youtube_${videoId}`,
          `markers-youtube-${videoId}`
        ]

        let savedState: VideoMarkerState | null = null
        
        // Try each possible storage key
        for (const key of storageKeys) {
          const stored = localStorage.getItem(key)
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              if (parsed && Array.isArray(parsed.markers) && Array.isArray(parsed.annotations)) {
                savedState = parsed
                break
              }
            } catch (e) {
              console.error('Error parsing YouTube markers:', e)
            }
          }
        }

        if (savedState) {
          console.log('Loaded markers for YouTube video:', {
            videoId,
            markers: savedState.markers.length,
            annotations: savedState.annotations.length
          })
          setInternalMarkerState(savedState)
        } else {
          setInternalMarkerState(EMPTY_STATE)
        }
        setIsLoaded(true)
        return
      }

      // Handle file system videos
      if (!videoPath || !rootHandle) {
        setInternalMarkerState(EMPTY_STATE)
        setIsLoaded(true)
        return
      }

      try {
        const savedState = await markersService.loadMarkers(rootHandle, videoPath)
        if (savedState) {
          setInternalMarkerState(savedState)
        } else {
          setInternalMarkerState(EMPTY_STATE)
        }
      } catch (error) {
        console.error('Error loading video markers:', error)
        setInternalMarkerState(EMPTY_STATE)
      }
      setIsLoaded(true)
    }

    loadMarkers()
  }, [videoPath, rootHandle])

  // Save markers to JSON file whenever they change
  const setMarkerState = useCallback(async (newState: VideoMarkerState) => {
    setInternalMarkerState(newState)

    // Handle YouTube videos
    if (videoPath.startsWith('youtube:')) {
      const videoId = videoPath.replace('youtube:', '')
      const storageKey = `youtube_markers_${videoId}`
      try {
        localStorage.setItem(storageKey, JSON.stringify(newState))
        console.log('Saved markers for YouTube video:', {
          videoId,
          markers: newState.markers.length,
          annotations: newState.annotations.length
        })
      } catch (error) {
        console.error('Error saving YouTube markers:', error)
      }
      return
    }

    // Handle file system videos
    if (videoPath && rootHandle) {
      try {
        await markersService.saveMarkers(rootHandle, videoPath, newState)
        // Refresh video list to update metadata status
        useDirectoryStore.getState().refreshVideoList()
      } catch (error) {
        console.error('Error saving video markers:', error)
      }
    }
  }, [videoPath, rootHandle])

  return {
    markerState,
    setMarkerState,
    isLoaded
  }
}