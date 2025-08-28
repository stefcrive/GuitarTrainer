'use client'

import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { TimeMarker, VideoAnnotation, VideoMarkerState, VideoPlayerControls } from '@/types/video'
import { AudioRecorder } from '@/services/audio-recorder'
import { cn } from '@/lib/utils'
import { VideoAnnotationEditor } from './VideoAnnotationEditor'
import { MarkerTimeEditor } from './MarkerTimeEditor'

interface VideoMarkersProps {
  videoControls: VideoPlayerControls
  markerState: VideoMarkerState
  setMarkerState: (state: VideoMarkerState) => void
  className?: string
  contentType?: 'video' | 'youtube'
}

export function VideoMarkers({ 
  videoControls, 
  markerState, 
  setMarkerState, 
  className,
  contentType = 'video'
}: VideoMarkersProps) {
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder())
  const currentRecordingRef = useRef<{
    markerId: string;
    promise: Promise<Blob | null>;
  } | null>(null)

  const [recordingError, setRecordingError] = useState<string | null>(null)

  const startRecording = useCallback(async (marker: TimeMarker) => {
    try {
      // If already recording for this marker, save the recording
      if (marker.isRecording) {
        const recording = currentRecordingRef.current
        if (recording && recording.markerId === marker.id) {
          console.log('Stopping existing recording for marker:', marker.id)
          const audioBlob = await audioRecorderRef.current.stopRecording()
          
          if (audioBlob) {
            const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
            await AudioRecorder.downloadAudio(audioBlob, filename)
          }
          
          const completedMarkers = markerState.markers.map((m: TimeMarker) =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          
          setMarkerState({
            ...markerState,
            markers: completedMarkers
          })
          currentRecordingRef.current = null
          return
        }
      }

      setRecordingError(null)
      
      // Update state to show recording state
      const startMarkers = markerState.markers.map((m: TimeMarker) =>
        m.id === marker.id ? { ...m, isRecording: true, audioBlob: undefined } : m
      )
      setMarkerState({
        ...markerState,
        markers: startMarkers
      })

      console.log('Starting recording for marker:', marker.id)
      
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
      
      // Set up a listener for the promise to handle auto-stop
      promise.then(async audioBlob => {
        console.log('Recording completed automatically:', marker.id)
        if (audioBlob) {
          const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
          await AudioRecorder.downloadAudio(audioBlob, filename)
          const completedMarkers = markerState.markers.map((m: TimeMarker) =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          setMarkerState({
            ...markerState,
            markers: completedMarkers
          })
        } else {
          const resetMarkers = markerState.markers.map((m: TimeMarker) =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          setMarkerState({
            ...markerState,
            markers: resetMarkers
          })
        }
        currentRecordingRef.current = null
      }).catch(error => {
        console.error('Recording promise rejected:', error)
        // Reset recording state
        const resetMarkers = markerState.markers.map((m: TimeMarker) =>
          m.id === marker.id ? { ...m, isRecording: false } : m
        )
        setMarkerState({
          ...markerState,
          markers: resetMarkers
        })
        currentRecordingRef.current = null
        setRecordingError('Recording failed: ' + (error.message || 'Unknown error'))
      })
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      setRecordingError('Recording failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
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

  const cancelRecording = useCallback((marker: TimeMarker) => {
    if (!marker.isRecording) return

    console.log('Cancelling recording for marker:', marker.id)
    audioRecorderRef.current.stopRecording()
    currentRecordingRef.current = null

    // Reset recording state
    const resetMarkers = markerState.markers.map((m: TimeMarker) =>
      m.id === marker.id ? { ...m, isRecording: false } : m
    )
    setMarkerState({
      ...markerState,
      markers: resetMarkers
    })
  }, [markerState, setMarkerState])

  const downloadAudio = useCallback((marker: TimeMarker) => {
    if (!marker.audioBlob) {
      console.error('No audio blob available for download')
      return
    }
    
    const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
    AudioRecorder.downloadAudio(marker.audioBlob, filename)
  }, [])

  const addMarker = useCallback(() => {
    const currentTime = videoControls.getCurrentTime()
    const duration = videoControls.getDuration()
    
    const newMarker: TimeMarker = {
      id: crypto.randomUUID(),
      startTime: currentTime,
      endTime: Math.min(currentTime + 10, duration),
      isLooping: false,
      completionDegree: 0,
      createdAt: Date.now() // Add creation timestamp
    }

    setMarkerState({
      ...markerState,
      markers: [...markerState.markers, newMarker],
      activeMarkerId: newMarker.id
    })
  }, [videoControls, markerState, setMarkerState])

  const handleAnnotationSave = useCallback((text: string, tags: string[]) => {
    if (!markerState.activeMarkerId) return

    const newAnnotation: VideoAnnotation = {
      id: crypto.randomUUID(),
      markerId: markerState.activeMarkerId,
      text,
      tags: [...tags],
      timestamp: Date.now()
    }

    const updatedAnnotations = markerState.annotations.filter(
      a => a.markerId !== markerState.activeMarkerId
    )

    const newState = {
      ...markerState,
      annotations: [...updatedAnnotations, newAnnotation]
    }

    console.log('Saving annotation:', {
      annotation: newAnnotation,
      totalAnnotations: newState.annotations.length,
      newState
    })

    setMarkerState(newState)
    setEditingMarkerId(null)
  }, [markerState, setMarkerState])

  const handleMarkerUpdate = useCallback((updatedMarker: TimeMarker, closeEditor = true) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.map(marker =>
        marker.id === updatedMarker.id ? updatedMarker : marker
      )
    })
    if (closeEditor) {
      setEditingMarkerId(null)
    }
  }, [markerState, setMarkerState])

  const handleCompletionUpdate = useCallback((marker: TimeMarker, value: number) => {
    handleMarkerUpdate({
      ...marker,
      completionDegree: value
    }, false)
  }, [handleMarkerUpdate])

  const handleMarkerDelete = useCallback((markerId: string) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.filter(m => m.id !== markerId),
      annotations: markerState.annotations.filter(a => a.markerId !== markerId),
      activeMarkerId: markerState.activeMarkerId === markerId ? null : markerState.activeMarkerId
    })
    setEditingMarkerId(null)
  }, [markerState, setMarkerState])

  const toggleLoop = useCallback((markerId: string) => {
    setMarkerState({
      ...markerState,
      markers: markerState.markers.map(marker => 
        marker.id === markerId 
          ? { ...marker, isLooping: !marker.isLooping }
          : { ...marker, isLooping: false }
      )
    })
  }, [markerState, setMarkerState])

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

  useEffect(() => {
    if (!videoControls || !markerState?.markers) return

    const checkLoop = () => {
      const currentTime = videoControls.getCurrentTime()
      const activeMarker = markerState.markers.find(m => m.isLooping)

      // Check for any recording markers that might have reached their end time
      const recordingMarker = markerState.markers.find(m => m.isRecording)
      if (recordingMarker && currentTime >= recordingMarker.endTime) {
        console.log('Recording marker reached end time:', recordingMarker.id, 'current time:', currentTime)
        // The auto-stop in AudioRecorder should handle stopping the recording,
        // but we'll update the UI state here to be safe
        const resetMarkers = markerState.markers.map((m: TimeMarker) =>
          m.id === recordingMarker.id ? { ...m, isRecording: false } : m
        )
        setMarkerState({
          ...markerState,
          markers: resetMarkers
        })
      }

      if (activeMarker && currentTime >= activeMarker.endTime) {
        videoControls.seek(activeMarker.startTime)
        videoControls.play()
      }
    }

    const intervalId = setInterval(checkLoop, 100)
    return () => clearInterval(intervalId)
  }, [videoControls, markerState?.markers])

  if (!markerState || !videoControls) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header Section */}
      <div className={`flex items-center justify-between p-4 rounded-lg border ${
        contentType === 'youtube' 
          ? 'bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20'
          : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            contentType === 'youtube'
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            <MarkersIcon className={`h-5 w-5 ${
              contentType === 'youtube'
                ? 'text-red-600 dark:text-red-400'
                : 'text-blue-600 dark:text-blue-400'
            }`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Markers & Annotations</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {markerState.markers.length} marker{markerState.markers.length !== 1 ? 's' : ''} created
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addMarker}
          className={`bg-white dark:bg-gray-800 ${
            contentType === 'youtube'
              ? 'hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          }`}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Marker
        </Button>
      </div>

      {recordingError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertIcon className="h-4 w-4" />
            {recordingError}
          </div>
        </div>
      )}

      {/* Markers Container */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="p-4">
          <div className="space-y-4">
            {(markerState.markers || []).map((marker, index) => {
              const hasAnnotation = markerState.annotations.some(a => a.markerId === marker.id)
              const annotation = markerState.annotations.find(a => a.markerId === marker.id)
              return (
                <div
                  key={marker.id}
                  className={cn(
                    'relative p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md cursor-pointer',
                    marker.id === markerState.activeMarkerId 
                      ? (contentType === 'youtube'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20 shadow-sm'
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-sm')
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                  onClick={(e) => {
                    // Only handle clicks on the container itself, not on buttons
                    if (e.target === e.currentTarget || e.target instanceof HTMLElement && !e.target.closest('button')) {
                      videoControls.seek(marker.startTime)
                      videoControls.play()
                      setMarkerState({
                        ...markerState,
                        activeMarkerId: marker.id
                      })
                    }
                  }}
                >
                  {/* Marker Number Badge */}
                  <div className={`absolute -top-2 -left-2 w-6 h-6 text-white text-xs font-bold rounded-full flex items-center justify-center ${
                    contentType === 'youtube' ? 'bg-red-500' : 'bg-blue-500'
                  }`}>
                    {index + 1}
                  </div>

                  <div className="space-y-3">
                    {/* First row: Time and primary action buttons */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            videoControls.seek(marker.startTime)
                            setMarkerState({
                              ...markerState,
                              activeMarkerId: marker.id
                            })
                          }}
                        >
                          <ClockIcon className="h-4 w-4 mr-2" />
                          {formatTime(marker.startTime)} - {formatTime(marker.endTime)}
                        </Button>

                        {/* Record / Stop / Cancel Buttons directly next to marker time */}
                        {!marker.isRecording ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              startRecording(marker)
                            }}
                          >
                            <MicIcon className="h-3 w-3 mr-1" />
                            Record
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 text-sm animate-pulse"
                              onClick={(e) => {
                                e.stopPropagation()
                                startRecording(marker)
                              }}
                            >
                              <MicIcon className="h-3 w-3 mr-1" />
                              Stop & Export
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-sm"
                              onClick={async (e) => {
                                e.stopPropagation()
                                await audioRecorderRef.current.stopRecording()
                                const resetMarkers = markerState.markers.map(m =>
                                  m.id === marker.id ? { ...m, isRecording: false } : m
                                )
                                setMarkerState({
                                  ...markerState,
                                  markers: resetMarkers
                                })
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Loop Button */}
                        <Button
                          variant={marker.isLooping ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 min-w-16 text-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleLoop(marker.id)
                          }}
                        >
                          {marker.isLooping ? (
                            <>
                              <StopIcon className="h-3 w-3 mr-1" />
                              Stop
                            </>
                          ) : (
                            <>
                              <LoopIcon className="h-3 w-3 mr-1" />
                              Loop
                            </>
                          )}
                        </Button>

                        {/* Edit Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingMarkerId(editingMarkerId === marker.id ? null : marker.id)
                          }}
                        >
                          {editingMarkerId === marker.id ? (
                            <>
                              <XIcon className="h-3 w-3 mr-1" />
                              Close
                            </>
                          ) : (
                            <>
                              <EditIcon className="h-3 w-3 mr-1" />
                              Edit
                            </>
                          )}
                        </Button>

                        {/* Delete Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkerDelete(marker.id)
                          }}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Second row: Completion progress bar (non-editable in normal view) */}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-muted-foreground font-medium w-32">
                        Completion: {marker.completionDegree || 0}%
                      </div>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            contentType === 'youtube' ? 'bg-red-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${marker.completionDegree || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Simplified: removed Download/Delete controls, Cancel shown inline above */}

                    {/* Display existing annotation when not editing */}
                    {!editingMarkerId && annotation && (
                      <div className="bg-muted/50 p-3 rounded-lg border border-muted">
                        <div className="flex items-start gap-3">
                          <div className={`p-1 rounded ${
                            contentType === 'youtube'
                              ? 'bg-red-100 dark:bg-red-900/30'
                              : 'bg-blue-100 dark:bg-blue-900/30'
                          }`}>
                            <FileTextIcon className={`h-3 w-3 ${
                              contentType === 'youtube'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm">{annotation.text}</p>
                            {annotation.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-2">
                                {annotation.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Edit Section */}
                  {editingMarkerId === marker.id && (
                    <div 
                      className="space-y-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MarkerTimeEditor
                        marker={marker}
                        maxDuration={videoControls.getDuration()}
                        videoControls={videoControls}
                        onSave={handleMarkerUpdate}
                        className="mb-3"
                      />
                      
                      {/* Editable completion progress in edit mode */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground font-medium">Completion Progress</span>
                          <span className={`font-semibold ${
                            contentType === 'youtube'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}>
                            {marker.completionDegree || 0}%
                          </span>
                        </div>
                        <Slider
                          value={[marker.completionDegree || 0]}
                          min={0}
                          max={100}
                          step={1}
                          className="w-full"
                          onValueChange={([value]) => {
                            handleCompletionUpdate(marker, value)
                          }}
                        />
                      </div>
                      
                      <div className="space-y-2 mt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <FileTextIcon className="h-4 w-4" />
                          <span className="font-medium">Notes and Tags</span>
                        </div>
                        <VideoAnnotationEditor
                          initialText={markerState.annotations.find(a => a.markerId === marker.id)?.text || ''}
                          initialTags={markerState.annotations.find(a => a.markerId === marker.id)?.tags || []}
                          onSave={handleAnnotationSave}
                          onCancel={() => setEditingMarkerId(null)}
                        />
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
  )
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Icon components
function MarkersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12h18M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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

function LoopIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 2v6h-6M3 12a9 9 0 015.68-8.31M3 22v-6h6M21 12a9 9 0 01-5.68 8.31" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}