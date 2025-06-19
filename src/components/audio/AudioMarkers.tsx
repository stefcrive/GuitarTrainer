'use client'

import { useCallback, useRef, useState } from 'react'
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
}

export function AudioMarkers({
  audioControls,
  markers,
  annotations,
  onMarkersChange,
  onAnnotationsChange,
  className
}: AudioMarkersProps) {
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false)
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)
  
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
      completionDegree: 0 // Initialize with 0% completion
    }

    onMarkersChange([...markers, newMarker])
    setActiveMarkerId(newMarker.id)
  }, [audioControls, markers, onMarkersChange])

  const startRecording = useCallback(async (marker: AudioMarker) => {
    try {
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

      // Wait for recording to complete
      const audioBlob = await promise
      
      // Update state with recorded audio
      const completedMarkers = markers.map(m =>
        m.id === marker.id
          ? { ...m, isRecording: false, audioBlob: audioBlob || undefined }
          : m
      )
      
      onMarkersChange(completedMarkers)
      currentRecordingRef.current = null
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      setRecordingError('Recording failed')
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
    setIsAddingAnnotation(false)
  }, [activeMarkerId, annotations, onAnnotationsChange])

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
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">Markers</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={addMarker}
        >
          Add Marker
        </Button>
      </div>

      {recordingError && (
        <div className="p-2 text-sm text-red-500 bg-red-50 rounded">
          {recordingError}
        </div>
      )}

      <div className="space-y-1.5">
        {markers.map(marker => (
          <div
            key={marker.id}
            className={cn(
              'p-2 rounded border',
              marker.id === activeMarkerId ? 'border-primary' : 'border-muted'
            )}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm"
                onClick={() => {
                  audioControls.seek(marker.startTime)
                  setActiveMarkerId(marker.id)
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
                      onClick={() => {
                        if (marker.audioBlob) {
                          const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`
                          AudioRecorder.downloadAudio(marker.audioBlob, filename)
                        }
                      }}
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
                        onMarkersChange(
                          markers.map(m =>
                            m.id === marker.id ? { ...m, audioBlob: undefined } : m
                          )
                        )
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
                {editingMarkerId === marker.id ? 'Close' : 'Edit'}
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

              {/* Completion progress slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Completion</span>
                  <span>{marker.completionDegree || 0}%</span>
                </div>
                <Slider
                  value={[marker.completionDegree || 0]}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                  onValueChange={(value: number[]) => {
                    handleCompletionUpdate(marker, value[0])
                  }}
                />
              </div>
            </div>

            {/* Marker Time Editor with Sync */}
            {editingMarkerId === marker.id && (
              <div className="space-y-4 mt-3 border-t pt-3">
                <MarkerTimeEditor
                  marker={marker}
                  maxDuration={audioControls.getDuration()}
                  audioControls={audioControls}
                  onSave={handleMarkerUpdate}
                />

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground mb-2">Notes and Tags</div>
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
                          onCancel={() => setEditingMarkerId(null)}
                        />
                      ))
                  ) : (
                    <VideoAnnotationEditor
                      onSave={handleAnnotationSave}
                      onCancel={() => setEditingMarkerId(null)}
                      initialTags={[]} // Explicitly set empty initial tags for new annotations
                    />
                  )}
                </div>
              </div>
            )}

            {/* Show existing annotations when not editing */}
            {!editingMarkerId && annotations
              .filter(a => a.markerId === marker.id)
              .map(annotation => (
                <div key={annotation.id} className="text-sm bg-muted p-1.5 rounded mt-1.5">
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
                        onClick={() => setEditingMarkerId(marker.id)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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