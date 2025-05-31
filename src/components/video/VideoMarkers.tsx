'use client'

import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { TimeMarker, VideoAnnotation, VideoMarkerState, VideoPlayerControls } from '@/types/video'
import { AudioRecorder, TimeMarkerAudio } from '@/services/audio-recorder'
import { cn } from '@/lib/utils'
import { VideoAnnotationEditor } from './VideoAnnotationEditor'
import { MarkerTimeEditor } from './MarkerTimeEditor'

interface VideoMarkersProps {
  videoControls: VideoPlayerControls
  markerState: VideoMarkerState
  setMarkerState: (state: VideoMarkerState) => void
  className?: string
}

export function VideoMarkers({ 
  videoControls, 
  markerState, 
  setMarkerState, 
  className 
}: VideoMarkersProps) {
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false)
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder())
  const currentRecordingRef = useRef<{
    markerId: string;
    promise: Promise<Blob | null>;
  } | null>(null)

  // Start recording audio for a marker
  const [recordingError, setRecordingError] = useState<string | null>(null)

  const startRecording = useCallback(async (marker: TimeMarker) => {
    try {
      setRecordingError(null)
      console.log('Starting recording for marker:', {
        startTime: marker.startTime,
        endTime: marker.endTime,
        duration: marker.endTime - marker.startTime
      })

      // Update state to show recording state
      const startMarkers = markerState.markers.map((m: TimeMarker) =>
        m.id === marker.id ? { ...m, isRecording: true, audioBlob: undefined } : m
      )
      setMarkerState({
        ...markerState,
        markers: startMarkers
      })

      // Start recording and store the promise
      const promise = audioRecorderRef.current.startRecording(
        marker.startTime,
        marker.endTime,
        videoControls
      )

      // Store current recording info
      currentRecordingRef.current = {
        markerId: marker.id,
        promise
      }

      // Wait for recording to complete
      const audioBlob = await promise
      console.log('Recording completed, got audio blob:', !!audioBlob)
      
      // Update state with recorded audio
      const completedMarkers = markerState.markers.map((m: TimeMarker) =>
        m.id === marker.id
          ? { ...m, isRecording: false, audioBlob: audioBlob || undefined }
          : m
      )
      
      setMarkerState({
        ...markerState,
        markers: completedMarkers
      })
      currentRecordingRef.current = null
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      setRecordingError('Recording failed')
      currentRecordingRef.current = null

      // Reset recording state
      const resetMarkers = markerState.markers.map((m: TimeMarker) =>
        m.id === marker.id ? { ...m, isRecording: false } : m
      )
      setMarkerState({
        ...markerState,
        markers: resetMarkers
      })
    }
  }, [markerState, setMarkerState, videoControls])

  // Monitor recording completion
  // No need for recording completion effect anymore since we handle it in startRecording

  // Stop recording and save audio for a marker
  // Stop recording is now handled automatically by the AudioRecorder service

  // Download recorded audio for a marker
  const downloadAudio = useCallback((marker: TimeMarker) => {
    if (!marker.audioBlob) {
      console.error('No audio blob available for download')
      return
    }
    
    const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
    AudioRecorder.downloadAudio(marker.audioBlob, filename)
  }, [])

  // Add a new marker at current time
  const addMarker = useCallback(() => {
    const currentTime = videoControls.getCurrentTime()
    const duration = videoControls.getDuration()
    
    const newMarker: TimeMarker = {
      id: crypto.randomUUID(),
      startTime: currentTime,
      endTime: Math.min(currentTime + 10, duration), // Default 10 second interval
      isLooping: false
    }

    setMarkerState({
      ...markerState,
      markers: [...markerState.markers, newMarker],
      activeMarkerId: newMarker.id
    })
  }, [videoControls, markerState, setMarkerState])

  // Add or update annotation for active marker
  const handleAnnotationSave = useCallback((text: string, tags: string[]) => {
    if (!markerState.activeMarkerId) return

    const newAnnotation: VideoAnnotation = {
      id: crypto.randomUUID(),
      markerId: markerState.activeMarkerId,
      text,
      tags: [...tags], // Create a new array to ensure immutability
      timestamp: Date.now()
    }

    // Filter out any existing annotations for this marker before adding the new one
    const updatedAnnotations = markerState.annotations.filter(
      a => a.markerId !== markerState.activeMarkerId
    )

    setMarkerState({
      ...markerState,
      annotations: [...updatedAnnotations, newAnnotation]
    })
    setIsAddingAnnotation(false)
  }, [markerState, setMarkerState])

  // Handle marker updates
  const handleMarkerUpdate = useCallback((updatedMarker: TimeMarker) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.map(marker =>
        marker.id === updatedMarker.id ? updatedMarker : marker
      )
    })
    setEditingMarkerId(null)
  }, [markerState, setMarkerState])

  // Delete marker and its annotations
  const handleMarkerDelete = useCallback((markerId: string) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.filter(m => m.id !== markerId),
      annotations: markerState.annotations.filter(a => a.markerId !== markerId),
      activeMarkerId: markerState.activeMarkerId === markerId ? null : markerState.activeMarkerId
    })
    setEditingMarkerId(null)
  }, [markerState, setMarkerState])

  // Delete a specific annotation
  const handleAnnotationDelete = useCallback((annotationId: string) => {
    setMarkerState({
      ...markerState,
      annotations: markerState.annotations.filter(a => a.id !== annotationId)
    })
    setEditingAnnotationId(null)
  }, [markerState, setMarkerState])

  // Toggle looping for a marker
  const toggleLoop = useCallback((markerId: string) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.map(marker => 
        marker.id === markerId 
          ? { ...marker, isLooping: !marker.isLooping }
          : { ...marker, isLooping: false } // Ensure only one marker is looping
      )
    })
  }, [markerState, setMarkerState])

  // Reset audio recordings when component unmounts (navigation)
  useLayoutEffect(() => {
    return () => {
      if (markerState.markers.some(m => m.audioBlob)) {
        setMarkerState({
          ...markerState,
          markers: markerState.markers.map(m => ({ ...m, audioBlob: undefined }))
        })
      }
    }
  }, [markerState, setMarkerState])

  // Handle video time updates for looping
  useEffect(() => {
    // Early return if videoControls or markers are not available
    if (!videoControls || !markerState?.markers) return

    const checkLoop = () => {
      const currentTime = videoControls.getCurrentTime()
      const activeMarker = markerState.markers.find(m => m.isLooping)

      if (activeMarker && currentTime >= activeMarker.endTime) {
        videoControls.seek(activeMarker.startTime)
        videoControls.play()
      }
    }

    const intervalId = setInterval(checkLoop, 100) // Check every 100ms
    return () => clearInterval(intervalId)
  }, [videoControls, markerState?.markers])

  if (!markerState || !videoControls) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {recordingError && (
        <div className="p-2 text-sm text-red-500 bg-red-50 rounded">
          {recordingError}
        </div>
      )}
      <div className="space-y-1.5">
        {(markerState.markers || []).map(marker => (
          <div
            key={marker.id}
            className={cn(
              'p-2 rounded border',
              marker.id === markerState.activeMarkerId ? 'border-primary' : 'border-muted'
            )}
          >
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm"
                onClick={() => {
                  videoControls.seek(marker.startTime)
                  setMarkerState({
                    ...markerState,
                    activeMarkerId: marker.id
                  })
                }}
              >
                {formatTime(marker.startTime)} - {formatTime(marker.endTime)}
              </Button>
              <Button
                variant={marker.isLooping ? 'default' : 'outline'}
                size="sm"
                className="h-7 min-w-14 text-sm"
                onClick={() => toggleLoop(marker.id)}
              >
                {marker.isLooping ? 'Stop' : 'Loop'}
              </Button>
              <div className="flex gap-1">
                {marker.audioBlob ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-sm"
                      onClick={() => downloadAudio(marker)}
                    >
                      Download Audio
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-3 text-sm"
                      onClick={() => startRecording(marker)}
                    >
                      Record Again
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 px-3 text-sm"
                      onClick={() => {
                        setMarkerState({
                          ...markerState,
                          markers: markerState.markers.map(m =>
                            m.id === marker.id ? { ...m, audioBlob: undefined } : m
                          )
                        })
                      }}
                    >
                      Delete Recording
                    </Button>
                  </>
                ) : marker.isRecording ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-3 text-sm"
                    disabled
                  >
                    Recording...
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-sm"
                    onClick={() => startRecording(marker)}
                  >
                    Record Audio
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm"
                onClick={() => setEditingMarkerId(editingMarkerId === marker.id ? null : marker.id)}
              >
                {editingMarkerId === marker.id ? 'Cancel' : 'Edit'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-100"
                onClick={() => handleMarkerDelete(marker.id)}
              >
                <TrashIcon className="h-3 w-3" />
              </Button>
            </div>

            {/* Marker Time Editor */}
            {editingMarkerId === marker.id && (
              <MarkerTimeEditor
                marker={marker}
                maxDuration={videoControls.getDuration()}
                videoControls={videoControls}
                onSave={handleMarkerUpdate}
                onDelete={() => handleMarkerDelete(marker.id)}
                className="mb-3"
              />
            )}

            {/* Show annotations for this marker */}
            <div className="space-y-1.5 mt-1.5">
              {(markerState.annotations || [])
                .filter(a => a.markerId === marker.id)
                .map(annotation => {
                  const isEditing = editingAnnotationId === annotation.id;
                  
                  if (isEditing) {
                    return (
                      <VideoAnnotationEditor
                        key={annotation.id}
                        initialText={annotation.text}
                        initialTags={annotation.tags}
                        onSave={(text, tags) => {
                          setMarkerState({
                            ...markerState,
                            annotations: markerState.annotations.map(a =>
                              a.id === annotation.id
                                ? { ...a, text, tags, timestamp: Date.now() }
                                : a
                            )
                          });
                          setEditingAnnotationId(null);
                        }}
                        onCancel={() => setEditingAnnotationId(null)}
                        className="mt-2"
                      />
                    );
                  }

                  return (
                    <div key={annotation.id} className="text-sm bg-muted p-1.5 rounded">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 flex items-center gap-4">
                          <p>{annotation.text}</p>
                          {annotation.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {annotation.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="px-1 py-0.5 bg-primary/10 text-primary text-xs rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-sm"
                            onClick={() => setEditingAnnotationId(annotation.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => handleAnnotationDelete(annotation.id)}
                          >
                            <TrashIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Show add annotation button when marker is active and has no annotations */}
            {marker.id === markerState.activeMarkerId &&
             !markerState.annotations.some(a => a.markerId === marker.id) && (
              <div className="mt-1.5">
                {isAddingAnnotation ? (
                  <VideoAnnotationEditor
                    onSave={handleAnnotationSave}
                    onCancel={() => setIsAddingAnnotation(false)}
                    className="mt-2"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-sm"
                    onClick={() => setIsAddingAnnotation(true)}
                  >
                    Add Note
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Trash icon component
function TrashIcon({ className }: { className?: string }) {
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
    >
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}