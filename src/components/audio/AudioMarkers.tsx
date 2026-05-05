'use client'

import { Fragment, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { AudioMarker, AudioAnnotation } from '@/types/audio'
import { AudioRecorder } from '@/services/audio-recorder'
import { VideoAnnotationEditor } from '../video/VideoAnnotationEditor'
import { MarkerTimeEditor } from './MarkerTimeEditor'
import { cn } from '@/lib/utils'
import { MarkerDiagramList } from '@/components/guitar/NeckDiagramEditor'
import {
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  List as ListIcon,
  Plus as PlusIcon,
  TableProperties as TableIcon
} from 'lucide-react'

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

type MarkerViewMode = 'table' | 'list'

const markerViewOptions = [
  { value: 'table' as const, label: 'Table', icon: TableIcon },
  { value: 'list' as const, label: 'List', icon: ListIcon }
]

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
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<MarkerViewMode>('table')
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(externalActiveMarkerId || null)

  // Collect all unique tags from current annotations
  const allAnnotationTags = useMemo(() => {
    const tags = Array.from(new Set(annotations.flatMap(a => a.tags))).sort()
    return tags
  }, [annotations])
  
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
      createdAt: Date.now(), // Add creation timestamp
      diagrams: []
    }

    onMarkersChange([...markers, newMarker])
    setActiveMarkerId(newMarker.id)
    setEditingMarkerId(newMarker.id) // Automatically open in edit mode
    onActiveMarkerIdChange?.(newMarker.id)
  }, [audioControls, markers, onMarkersChange, onActiveMarkerIdChange])

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

  const handleAnnotationSave = useCallback((markerId: string, text: string, tags: string[]) => {
    const newAnnotation: AudioAnnotation = {
      id: crypto.randomUUID(),
      markerId,
      text,
      tags,
      timestamp: Date.now()
    }

    // Filter out any existing annotations for this marker before adding the new one
    const updatedAnnotations = annotations.filter(
      a => a.markerId !== markerId
    )

    onAnnotationsChange([...updatedAnnotations, newAnnotation])
    setEditingMarkerId(null)
    setActiveMarkerId(markerId)
    onActiveMarkerIdChange?.(markerId)
  }, [annotations, onAnnotationsChange, onActiveMarkerIdChange])

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

  const toggleLoop = useCallback((markerId: string) => {
    onMarkersChange(
      markers.map(marker => 
        marker.id === markerId 
          ? { ...marker, isLooping: !marker.isLooping }
          : { ...marker, isLooping: false }
      )
    )
  }, [markers, onMarkersChange])

  const markerCountLabel = `${markers.length} marker${markers.length !== 1 ? 's' : ''}`
  const accentProgressClass = 'bg-purple-600'
  const accentTextClass = 'text-purple-600 dark:text-purple-400'

  const getAnnotation = (markerId: string) => annotations.find(a => a.markerId === markerId)
  const getMarkerTitle = (marker: AudioMarker, index: number) => marker.title?.trim() || `Marker ${index + 1}`
  const getTimeLabel = (marker: AudioMarker) => `${formatTime(marker.startTime)} - ${formatTime(marker.endTime)}`

  const activateMarker = (marker: AudioMarker, play = false) => {
    audioControls.seek(marker.startTime)
    if (play) {
      audioControls.play()
    }
    setActiveMarkerId(marker.id)
    onActiveMarkerIdChange?.(marker.id)
  }

  const toggleMarkerDetails = (marker: AudioMarker) => {
    activateMarker(marker)
    setEditingMarkerId(editingMarkerId === marker.id ? null : marker.id)
  }

  const renderTags = (tags: string[]) => (
    tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => (
          <span
            key={tag}
            className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
          >
            {tag}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">None</span>
    )
  )

  const renderProgress = (completion = 0, compact = false) => (
    <div className={cn('flex items-center gap-2', compact ? 'min-w-28' : 'w-full')}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', accentProgressClass)}
          style={{ width: `${completion}%` }}
        />
      </div>
      <span className={cn('text-xs font-medium tabular-nums', accentTextClass)}>{completion}%</span>
    </div>
  )

  const renderRecordControls = (marker: AudioMarker) => (
    !marker.isRecording ? (
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
            const resetMarkers = markers.map(m =>
              m.id === marker.id ? { ...m, isRecording: false } : m
            )
            onMarkersChange(resetMarkers)
          }}
        >
          Cancel
        </Button>
      </div>
    )
  )

  const renderLoopButton = (marker: AudioMarker) => (
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
  )

  const renderDeleteButton = (marker: AudioMarker) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={(e) => {
        e.stopPropagation()
        handleMarkerDelete(marker.id)
      }}
      title="Delete marker"
    >
      <TrashIcon className="h-4 w-4" />
    </Button>
  )

  const renderMarkerDetails = (marker: AudioMarker) => {
    const annotation = getAnnotation(marker.id)
    return (
      <div
        className="border-t border-border/80 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <section className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Marker Title</label>
              <Input
                value={marker.title || ''}
                onChange={(e) => {
                  handleMarkerUpdate({ ...marker, title: e.target.value }, false)
                }}
                placeholder="Add a title for this marker..."
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ClockIcon className="h-4 w-4" />
                Timing
              </div>
              <MarkerTimeEditor
                marker={marker}
                maxDuration={audioControls.getDuration()}
                audioControls={audioControls}
                onSave={handleMarkerUpdate}
              />
              <div className="flex flex-wrap gap-2">
                {renderRecordControls(marker)}
                {renderLoopButton(marker)}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">Completion Progress</span>
                <span className={cn('font-semibold', accentTextClass)}>
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
            </section>
          </div>

          <div className="space-y-5">
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileTextIcon className="h-4 w-4" />
                Notes and Tags
              </div>
              <VideoAnnotationEditor
                initialText={annotation?.text || ''}
                initialTags={annotation?.tags || []}
                clearOnSave={!annotation}
                availableTags={allAnnotationTags}
                onSave={(text, tags) => handleAnnotationSave(marker.id, text, tags)}
                onCancel={() => setEditingMarkerId(null)}
              />
            </section>

            <MarkerDiagramList
              diagrams={marker.diagrams || []}
              onChange={(next) => {
                handleMarkerUpdate({ ...marker, diagrams: next }, false)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{markerCountLabel}</div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={markerViewOptions}
            value={viewMode}
            onValueChange={setViewMode}
            size="sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addMarker}
            className="gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            Add Marker
          </Button>
        </div>
      </div>

      {recordingError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertIcon className="h-4 w-4" />
            {recordingError}
          </div>
        </div>
      )}

      {markers.length === 0 ? (
        <div className="rounded-md border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
          No markers yet.
        </div>
      ) : viewMode === 'table' ? (
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/45 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-14 px-3 py-2">#</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="w-36 px-3 py-2">Timestamp</th>
                  <th className="w-40 px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="w-44 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {markers.map((marker, index) => {
                  const annotation = getAnnotation(marker.id)
                  const isExpanded = editingMarkerId === marker.id
                  const isActive = marker.id === activeMarkerId
                  return (
                    <Fragment key={marker.id}>
                      <tr
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/45',
                          isActive && 'bg-purple-500/10'
                        )}
                        onClick={() => {
                          activateMarker(marker, true)
                          setEditingMarkerId(isExpanded ? null : marker.id)
                        }}
                      >
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={cn('flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-white', accentProgressClass)}>
                              {index + 1}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="font-medium text-foreground">{getMarkerTitle(marker, index)}</div>
                          {annotation?.text && (
                            <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{annotation.text}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-middle font-medium tabular-nums">
                          {getTimeLabel(marker)}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          {renderProgress(marker.completionDegree || 0, true)}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          {renderTags(annotation?.tags || [])}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex justify-end gap-1.5">
                            {renderLoopButton(marker)}
                            {renderDeleteButton(marker)}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${marker.id}-details`}>
                          <td colSpan={6} className="bg-background px-4 py-4">
                            {renderMarkerDetails(marker)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-background p-3">
          <div className="space-y-3">
            {markers.map((marker, index) => {
              const annotation = getAnnotation(marker.id)
              const isExpanded = editingMarkerId === marker.id
              return (
                <div
                  key={marker.id}
                  className={cn(
                    'relative cursor-pointer rounded-md border p-3 transition-colors',
                    marker.id === activeMarkerId
                      ? 'border-purple-500/60 bg-purple-500/10'
                      : 'border-border hover:bg-muted/45'
                  )}
                  onClick={(e) => {
                    if (e.target === e.currentTarget || e.target instanceof HTMLElement && !e.target.closest('button, input, textarea, [role="slider"]')) {
                      activateMarker(marker, true)
                    }
                  }}
                >
                  <div className={cn('absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-white', accentProgressClass)}>
                    {index + 1}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="font-medium">{getMarkerTitle(marker, index)}</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation()
                            activateMarker(marker)
                          }}
                        >
                          <ClockIcon className="h-4 w-4 mr-2" />
                          {getTimeLabel(marker)}
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {renderRecordControls(marker)}
                        {renderLoopButton(marker)}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMarkerDetails(marker)
                          }}
                        >
                          {isExpanded ? (
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
                        {renderDeleteButton(marker)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {renderProgress(marker.completionDegree || 0)}
                      {annotation && !isExpanded && (
                        <div className="flex items-start gap-2">
                          <FileTextIcon className={cn('mt-0.5 h-3 w-3', accentTextClass)} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs text-muted-foreground">{annotation.text}</p>
                            <div className="mt-1">{renderTags(annotation.tags)}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {isExpanded && renderMarkerDetails(marker)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
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
