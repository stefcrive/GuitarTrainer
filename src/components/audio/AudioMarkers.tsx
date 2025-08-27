'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { AudioMarker, AudioAnnotation } from '@/types/audio'
import { AudioRecorder } from '@/services/audio-recorder'
import { VideoAnnotationEditor } from '../video/VideoAnnotationEditor'
import { MarkerTimeEditor } from './MarkerTimeEditor'
import { cn } from '@/lib/utils'

// Create a compatible interface adapter for VideoPlayerControls
interface AudioPlayerControls {
  getCurrentTime: () => number
  getDuration: () => number
  seek: (time: number) => void
  play: () => void
}

const createVideoControlsAdapter = (controls: AudioPlayerControls) => ({
  ...controls,
  pause: () => {}, // No-op, not needed for markers
  seekForward: () => {}, // No-op, not needed for markers
  seekBackward: () => {}, // No-op, not needed for markers
  setPlaybackRate: () => {}, // No-op, not needed for markers
  getPlaybackRate: () => 1, // Default playback rate
  getVideoElement: () => null, // No-op, not needed for markers
  getDurationDisplay: () => formatTime(controls.getDuration()) // Add display format
})

interface AudioMarkersProps {
  audioControls: AudioPlayerControls
  markers: AudioMarker[]
  annotations: AudioAnnotation[]
  onMarkersChange: (markers: AudioMarker[]) => void
  onAnnotationsChange: (annotations: AudioAnnotation[]) => void
  className?: string
  externalActiveMarkerId?: string | null
  onActiveMarkerIdChange?: (markerId: string | null) => void
}

export function AudioMarkers({
  audioControls,
  markers,
  annotations,
  onMarkersChange,
  onAnnotationsChange,
  className,
  externalActiveMarkerId,
  onActiveMarkerIdChange
}: AudioMarkersProps) {
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false)
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(externalActiveMarkerId || null)
  
  // Sync external activeMarkerId with internal state (only when external is provided)
  useEffect(() => {
    if (externalActiveMarkerId !== undefined && externalActiveMarkerId !== activeMarkerId) {
      setActiveMarkerId(externalActiveMarkerId)
    }
  }, [externalActiveMarkerId, activeMarkerId])
  
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder())
  const currentRecordingRef = useRef<{
    markerId: string
    promise: Promise<Blob | null>
  } | null>(null)

  const [recordingError, setRecordingError] = useState<string | null>(null)

  const addMarker = useCallback(() => {
    const currentTime = audioControls.getCurrentTime()
    const duration = audioControls.getDuration()
    
    const newMarker: AudioMarker = {
      id: crypto.randomUUID(),
      startTime: currentTime,
      endTime: Math.min(currentTime + 10, duration), // Default 10 second interval
      isLooping: false,
      completionDegree: 0, // Initialize with 0% completion
      createdAt: Date.now() // Add creation timestamp
    }

    onMarkersChange([...markers, newMarker])
    setActiveMarkerId(newMarker.id)
  }, [audioControls, markers, onMarkersChange])

  const startRecording = useCallback(async (marker: AudioMarker) => {
    try {
      // If already recording for this marker, save the recording
      if (marker.isRecording) {
        const recording = currentRecordingRef.current
        if (recording && recording.markerId === marker.id) {
          const audioBlob = await audioRecorderRef.current.stopRecording()
          
          // Immediately download if blob exists
          if (audioBlob) {
            const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
            await AudioRecorder.downloadAudio(audioBlob, filename)
          }
          
          const completedMarkers = markers.map(m =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          onMarkersChange(completedMarkers)
          currentRecordingRef.current = null
          return
        }
      }

      setRecordingError(null)
      
      // Update state to show recording state
      const startMarkers = markers.map(m =>
        m.id === marker.id ? { ...m, isRecording: true, audioBlob: undefined } : m
      )
      onMarkersChange(startMarkers)

      // Start recording and store the promise
      const promise = audioRecorderRef.current.startRecording(
        marker.startTime,
        marker.endTime,
        createVideoControlsAdapter(audioControls)
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
          
          const completedMarkers = markers.map((m: AudioMarker) =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          onMarkersChange(completedMarkers)
        } else {
          const resetMarkers = markers.map((m: AudioMarker) =>
            m.id === marker.id ? { ...m, isRecording: false } : m
          )
          onMarkersChange(resetMarkers)
        }
        currentRecordingRef.current = null
      }).catch(error => {
        console.error('Recording promise rejected:', error)
        const resetMarkers = markers.map((m: AudioMarker) =>
          m.id === marker.id ? { ...m, isRecording: false } : m
        )
        onMarkersChange(resetMarkers)
        currentRecordingRef.current = null
        setRecordingError('Recording failed: ' + (error.message || 'Unknown error'))
      })
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      setRecordingError('Recording failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
      currentRecordingRef.current = null

      // Reset recording state
      const resetMarkers = markers.map(m =>
        m.id === marker.id ? { ...m, isRecording: false } : m
      )
      onMarkersChange(resetMarkers)
    }
  }, [markers, onMarkersChange, audioControls])

  const handleAnnotationSave = useCallback((text: string, tags: string[]) => {
    if (!activeMarkerId) return

    const newAnnotation: AudioAnnotation = {
      id: crypto.randomUUID(),
      markerId: activeMarkerId,
      text,
      tags,
      timestamp: Date.now()
    }

    // Filter out any existing annotations for this marker before adding the new one
    const updatedAnnotations = annotations.filter(
      a => a.markerId !== activeMarkerId
    )

    onAnnotationsChange([...updatedAnnotations, newAnnotation])
    // Close the editor and clear active marker after saving (match VideoMarkers behavior)
    setIsAddingAnnotation(false)
    setEditingMarkerId(null)
    setActiveMarkerId(null)
  }, [activeMarkerId, annotations, onAnnotationsChange, setEditingMarkerId, setActiveMarkerId])

  const handleMarkerUpdate = useCallback((updatedMarker: AudioMarker, closeEditor = true) => {
    onMarkersChange(
      markers.map(marker =>
        marker.id === updatedMarker.id ? updatedMarker : marker
      )
    )
    if (closeEditor) {
      setEditingMarkerId(null)
    }
  }, [markers, onMarkersChange])

  const handleCompletionUpdate = useCallback((marker: AudioMarker, value: number) => {
    handleMarkerUpdate({
      ...marker,
      completionDegree: value
    }, false) // Don't close editor when updating completion
  }, [handleMarkerUpdate])

  const handleMarkerDelete = useCallback((markerId: string) => {
    onMarkersChange(markers.filter(m => m.id !== markerId))
    onAnnotationsChange(annotations.filter(a => a.markerId !== markerId))
    setActiveMarkerId(activeMarkerId === markerId ? null : activeMarkerId)
    setEditingMarkerId(null)
  }, [markers, annotations, activeMarkerId, onMarkersChange, onAnnotationsChange])

  const handleAnnotationDelete = useCallback((annotationId: string) => {
    onAnnotationsChange(annotations.filter(a => a.id !== annotationId))
    setEditingAnnotationId(null)
  }, [annotations, onAnnotationsChange])

  const toggleLoop = useCallback((markerId: string) => {
    onMarkersChange(
      markers.map(marker => 
        marker.id === markerId 
          ? { ...marker, isLooping: !marker.isLooping }
          : { ...marker, isLooping: false }
      )
    )
  }, [markers, onMarkersChange])

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header Section */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
            <AudioIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audio Markers</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {markers.length} marker{markers.length !== 1 ? 's' : ''} created
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addMarker}
          className="bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-200 dark:border-purple-800"
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
            {markers.map((marker, index) => {
              const annotation = annotations.find(a => a.markerId === marker.id)
              return (
                <div
                  key={marker.id}
                  className={cn(
                    'relative p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md cursor-pointer',
                    marker.id === activeMarkerId 
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20 shadow-sm' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                  onClick={(e) => {
                    // Only handle clicks on the container itself, not on buttons
                    if (e.target === e.currentTarget || e.target instanceof HTMLElement && !e.target.closest('button')) {
                      audioControls.seek(marker.startTime)
                      audioControls.play()
                      setActiveMarkerId(marker.id)
                      onActiveMarkerIdChange?.(marker.id)
                    }
                  }}
                >
                  {/* Marker Number Badge */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 bg-purple-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {index + 1}
                  </div>

                  <div className="space-y-3">
                    {/* Time and Action Buttons */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            audioControls.seek(marker.startTime)
                            setActiveMarkerId(marker.id)
                            onActiveMarkerIdChange?.(marker.id)
                          }}
                        >
                          <ClockIcon className="h-4 w-4 mr-2" />
                          {formatTime(marker.startTime)} - {formatTime(marker.endTime)}
                        </Button>
                        
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

                        {/* Record / Stop & Export + Cancel Buttons now positioned here */}
                        {!marker.isRecording ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-sm"
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
                              className="h-8 px-3 text-sm animate-pulse"
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
                              className="h-8 px-3 text-sm"
                              onClick={async (e) => {
                                e.stopPropagation()
                                await audioRecorderRef.current.stopRecording()
                                const resetMarkers = markers.map(m =>
                                  m.id === marker.id ? { ...m, isRecording: false } : m
                                )
                                onMarkersChange(resetMarkers)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            const willClose = editingMarkerId === marker.id
                            setEditingMarkerId(willClose ? null : marker.id)
                            const newActiveId = willClose ? null : marker.id
                            setActiveMarkerId(newActiveId)
                            onActiveMarkerIdChange?.(newActiveId)
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

                    {/* Audio Recording Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Removed extra download/delete buttons for simplicity */}
                    </div>

                    {/* Second row: Completion (read-only in normal view) */}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-muted-foreground font-medium w-32">
                        Completion: {marker.completionDegree || 0}%
                      </div>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-purple-600 h-full rounded-full"
                          style={{ width: `${marker.completionDegree || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Display existing annotation when not editing */}
                    {!editingMarkerId && annotation && (
                      <div className="bg-muted/50 p-3 rounded-lg border border-muted">
                        <div className="flex items-start gap-3">
                          <div className="p-1 bg-purple-100 dark:bg-purple-900/30 rounded">
                            <FileTextIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
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
                        maxDuration={audioControls.getDuration()}
                        audioControls={audioControls}
                        onSave={handleMarkerUpdate}
                      />

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <FileTextIcon className="h-4 w-4" />
                          <span className="font-medium">Notes and Tags</span>
                        </div>
                        {annotations.some(a => a.markerId === marker.id) ? (
                          annotations
                            .filter(a => a.markerId === marker.id)
                            .map(annotation => (
                              <VideoAnnotationEditor
                                key={annotation.id}
                                initialText={annotation.text}
                                initialTags={annotation.tags}
                                onSave={(text, tags) => {
                                  onAnnotationsChange(
                                    annotations.map(a =>
                                      a.id === annotation.id
                                        ? { ...a, text, tags, timestamp: Date.now() }
                                        : a
                                    )
                                  )
                                }}
                                onCancel={() => {
                                  setEditingMarkerId(null)
                                  setActiveMarkerId(null)
                                }}
                              />
                            ))
                        ) : (
                          <VideoAnnotationEditor
                            onSave={handleAnnotationSave}
                            onCancel={() => {
                              setEditingMarkerId(null)
                              setActiveMarkerId(null)
                            }}
                            initialTags={[]} // Explicitly set empty initial tags for new annotations
                          />
                        )}
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
function AudioIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 18V5l12-2v13M6 19a3 3 0 100-6 3 3 0 000 6zM18 16a3 3 0 100-6 3 3 0 000 6z" />
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