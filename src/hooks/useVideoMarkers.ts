import { useState, useEffect, useCallback, useRef } from 'react'
import type { VideoMarkerState, VideoMarkerStateUpdate } from '@/types/video'
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
  const markerStateRef = useRef<VideoMarkerState>(EMPTY_STATE)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load markers when videoPath changes
  useEffect(() => {
    const loadMarkers = async () => {
      setIsLoaded(false)

      if (!videoPath || !rootHandle) {
        markerStateRef.current = EMPTY_STATE
        setInternalMarkerState(EMPTY_STATE)
        setIsLoaded(true)
        return
      }

      try {
        const savedState = await markersService.loadMarkers(rootHandle, videoPath)
        if (savedState) {
          markerStateRef.current = savedState
          setInternalMarkerState(savedState)
        } else {
          markerStateRef.current = EMPTY_STATE
          setInternalMarkerState(EMPTY_STATE)
        }
      } catch (error) {
        console.error('Error loading video markers:', error)
        markerStateRef.current = EMPTY_STATE
        setInternalMarkerState(EMPTY_STATE)
      }
      setIsLoaded(true)
    }

    loadMarkers()
  }, [videoPath, rootHandle])

  // Save markers to SQLite whenever they change
  const setMarkerState = useCallback(async (nextState: VideoMarkerStateUpdate) => {
    const resolvedState =
      typeof nextState === 'function' ? nextState(markerStateRef.current) : nextState
    markerStateRef.current = resolvedState
    setInternalMarkerState(resolvedState)

    if (videoPath && rootHandle) {
      try {
        await markersService.saveMarkers(rootHandle, videoPath, resolvedState)
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
