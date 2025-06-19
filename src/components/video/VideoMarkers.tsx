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
}

export function VideoMarkers({ 
  videoControls, 
  markerState, 
  setMarkerState, 
  className 
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
          const audioBlob = await audioRecorderRef.current.stopRecording()
          
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

  const cancelRecording = useCallback((marker: TimeMarker) => {
    if (!marker.isRecording) return

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
      completionDegree: 0
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

    setMarkerState({
      ...markerState,
      annotations: [...updatedAnnotations, newAnnotation]
    })
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
    <div className={cn('space-y-2', className)}>
      {recordingError && (
        <div className="p-2 text-sm text-red-500 bg-red-50 rounded">
          {recordingError}
        </div>
      )}
      <div className="space-y-1.5">
        {(markerState.markers || []).map(marker => {
          const hasAnnotation = markerState.annotations.some(a => a.markerId === marker.id)
          return (
            <div
              key={marker.id}
              className={cn(
                'p-2 rounded border',
                marker.id === markerState.activeMarkerId ? 'border-primary' : 'border-muted',
                !hasAnnotation && 'border-dashed'
              )}
            >
              <div className="space-y-2">
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
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-3 text-sm"
                          onClick={() => startRecording(marker)}
                        >
                          Recording... (Click to Save)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-sm"
                          onClick={() => cancelRecording(marker)}
                        >
                          Cancel
                        </Button>
                      </div>
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
                    onValueChange={([value]) => {
                      handleCompletionUpdate(marker, value)
                    }}
                  />
                </div>
              </div>

              {/* Time and Annotations Editor */}
              {editingMarkerId === marker.id && (
                <div className="space-y-4 mt-3 border-t pt-3">
                  <MarkerTimeEditor
                    marker={marker}
                    maxDuration={videoControls.getDuration()}
                    videoControls={videoControls}
                    onSave={handleMarkerUpdate}
                    className="mb-3"
                  />
                  
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-2">Notes and Tags</div>
                    <VideoAnnotationEditor
                      initialText={markerState.annotations.find(a => a.markerId === marker.id)?.text || ''}
                      initialTags={markerState.annotations.find(a => a.markerId === marker.id)?.tags || []}
                      onSave={handleAnnotationSave}
                      onCancel={() => setEditingMarkerId(null)}
                    />
                  </div>
                </div>
              )}

              {/* Display existing annotation */}
              {!editingMarkerId && (() => {
                const annotation = markerState.annotations.find(a => a.markerId === marker.id)
                if (!annotation) return null
                
                return (
                  <div className="text-sm bg-muted p-1.5 rounded mt-1.5">
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
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })}
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