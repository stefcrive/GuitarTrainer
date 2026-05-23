'use client'

import { Fragment, useCallback, useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { TimeMarker, VideoAnnotation, VideoMarkerState, VideoMarkerStateUpdate, VideoPlayerControls } from '@/types/video'
import { AudioRecorder } from '@/services/audio-recorder'
import { cn } from '@/lib/utils'
import { useDirectoryStore } from '@/stores/directory-store'
import { VideoAnnotationEditor } from './VideoAnnotationEditor'
import { MarkerTimeEditor } from './MarkerTimeEditor'
import { MarkerDiagramList } from '@/components/guitar/NeckDiagramEditor'
import { LearningDomainSelect } from '@/components/learning/LearningDomainSelect'
import {
  AlertCircle as AlertIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Clock as ClockIcon,
  Edit3 as EditIcon,
  FileText as FileTextIcon,
  List as ListIcon,
  Mic as MicIcon,
  Repeat as LoopIcon,
  TableProperties as TableIcon,
  Square as StopIcon,
  Trash2 as TrashIcon,
  X as XIcon
} from 'lucide-react'

interface VideoMarkersProps {
  videoControls: VideoPlayerControls
  markerState: VideoMarkerState
  setMarkerState: (state: VideoMarkerStateUpdate) => void
  className?: string
  contentType?: 'video' | 'youtube'
}

type MarkerViewMode = 'table' | 'list'

const markerViewOptions = [
  { value: 'table' as const, label: 'Table', icon: TableIcon },
  { value: 'list' as const, label: 'List', icon: ListIcon }
]

export function VideoMarkers({ 
  videoControls, 
  markerState, 
  setMarkerState, 
  className,
  contentType = 'video'
}: VideoMarkersProps) {
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<MarkerViewMode>('table')

  // Collect all unique tags from current annotations
  const allAnnotationTags = useMemo(() => {
    return Array.from(new Set(markerState.annotations.flatMap(a => a.tags))).sort()
  }, [markerState.annotations])
  
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder())
  const currentRecordingRef = useRef<{
    markerId: string;
    promise: Promise<Blob | null>;
  } | null>(null)
  const previousMarkerCountRef = useRef(markerState.markers.length)

  const [recordingError, setRecordingError] = useState<string | null>(null)
  const rootHandle = useDirectoryStore((state) => state.rootHandle)

  const saveRecording = useCallback(async (marker: TimeMarker, audioBlob: Blob) => {
    const filename = `marker-${formatTime(marker.startTime)}-${formatTime(marker.endTime)}.wav`

    if (!rootHandle) {
      setRecordingError('Please select a video root directory in Settings to save recordings.')
      await AudioRecorder.downloadAudio(audioBlob, filename)
      return
    }

    try {
      await AudioRecorder.saveAudioToRecordingsFolder(audioBlob, filename, rootHandle)
    } catch (error) {
      console.error('Failed to save recording:', error)
      setRecordingError('Failed to save recording to the Recordings folder. Check Settings permissions.')
      await AudioRecorder.downloadAudio(audioBlob, filename)
    }
  }, [rootHandle])

  const startRecording = useCallback(async (marker: TimeMarker) => {
    try {
      // If already recording for this marker, save the recording
      if (marker.isRecording) {
        const recording = currentRecordingRef.current
        if (recording && recording.markerId === marker.id) {
          console.log('Stopping existing recording for marker:', marker.id)
          const audioBlob = await audioRecorderRef.current.stopRecording()
          
          if (audioBlob) {
            await saveRecording(marker, audioBlob)
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
          await saveRecording(marker, audioBlob)
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
  }, [markerState, saveRecording, setMarkerState, videoControls])

  const handleAnnotationSave = useCallback((markerId: string, text: string, tags: string[]) => {
    setMarkerState((prevState) => {
      const newAnnotation: VideoAnnotation = {
        id: crypto.randomUUID(),
        markerId,
        text,
        tags: [...tags],
        timestamp: Date.now()
      }

      const updatedAnnotations = prevState.annotations.filter(
        a => a.markerId !== markerId
      )

      const newState = {
        ...prevState,
        annotations: [...updatedAnnotations, newAnnotation]
      }

      console.log('Saving annotation:', {
        annotation: newAnnotation,
        totalAnnotations: newState.annotations.length,
        newState
      })

      return newState
    })
    setEditingMarkerId(null)
  }, [setMarkerState])

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

  useEffect(() => {
    if (markerState.markers.length > previousMarkerCountRef.current && markerState.activeMarkerId) {
      setEditingMarkerId(markerState.activeMarkerId)
    }
    previousMarkerCountRef.current = markerState.markers.length
  }, [markerState.activeMarkerId, markerState.markers.length])

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

  const markers = markerState.markers || []
  const accentProgressClass = contentType === 'youtube' ? 'bg-red-500' : 'bg-blue-500'
  const accentTextClass = contentType === 'youtube'
    ? 'text-red-600 dark:text-red-400'
    : 'text-blue-600 dark:text-blue-400'
  const markerCountLabel = `${markers.length} marker${markers.length !== 1 ? 's' : ''}`

  const getAnnotation = (markerId: string) => markerState.annotations.find(a => a.markerId === markerId)
  const getMarkerTitle = (marker: TimeMarker, index: number) => marker.title?.trim() || `Marker ${index + 1}`
  const getTimeLabel = (marker: TimeMarker) => `${formatTime(marker.startTime)} - ${formatTime(marker.endTime)}`

  const activateMarker = (marker: TimeMarker, play = false) => {
    videoControls.seek(marker.startTime)
    if (play) {
      videoControls.play()
    }
    setMarkerState({
      ...markerState,
      activeMarkerId: marker.id
    })
  }

  const selectMarker = (marker: TimeMarker) => {
    setMarkerState({
      ...markerState,
      activeMarkerId: marker.id
    })
  }

  const toggleMarkerDetails = (marker: TimeMarker) => {
    selectMarker(marker)
    setEditingMarkerId(editingMarkerId === marker.id ? null : marker.id)
  }

  const renderTags = (tags: string[], collapsed = false) => {
    const visibleTags = collapsed ? tags.slice(0, 3) : tags
    const hiddenCount = Math.max(0, tags.length - visibleTags.length)

    return (
    tags.length > 0 ? (
      <div
        className={cn(
          'flex gap-1',
          collapsed ? 'max-w-64 flex-nowrap overflow-hidden' : 'flex-wrap'
        )}
        title={collapsed && tags.length > 0 ? tags.join(', ') : undefined}
      >
        {visibleTags.map(tag => (
          <span
            key={tag}
            className={cn(
              'rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary',
              collapsed && 'max-w-28 truncate'
            )}
          >
            {tag}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            +{hiddenCount}
          </span>
        )}
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">None</span>
    )
  )}

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

  const renderRecordControls = (marker: TimeMarker) => (
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
    )
  )

  const renderLoopButton = (marker: TimeMarker) => (
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

  const renderDeleteButton = (marker: TimeMarker) => (
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

  const renderLoadButton = (marker: TimeMarker) => (
    <Button
      variant="outline"
      size="sm"
      className="h-8 min-w-16 text-sm"
      onClick={(e) => {
        e.stopPropagation()
        activateMarker(marker)
      }}
      title="Load marker in player"
    >
      <ClockIcon className="h-3 w-3 mr-1" />
      Load
    </Button>
  )

  const renderMarkerDetails = (marker: TimeMarker) => {
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

            <section className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Learning Domain</label>
              <LearningDomainSelect
                value={marker.learning?.domain}
                className="w-full"
                onChange={(domain) => {
                  handleMarkerUpdate({
                    ...marker,
                    learning: {
                      ...(marker.learning ?? {}),
                      domain
                    }
                  }, false)
                }}
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ClockIcon className="h-4 w-4" />
                Timing
              </div>
              <MarkerTimeEditor
                marker={marker}
                maxDuration={videoControls.getDuration()}
                videoControls={videoControls}
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
        <SegmentedControl
          options={markerViewOptions}
          value={viewMode}
          onValueChange={setViewMode}
          size="sm"
        />
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
                  <th className="w-56 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {markers.map((marker, index) => {
                  const annotation = getAnnotation(marker.id)
                  const isExpanded = editingMarkerId === marker.id
                  const isActive = marker.id === markerState.activeMarkerId
                  return (
                    <Fragment key={marker.id}>
                      <tr
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/45',
                          isActive && (contentType === 'youtube' ? 'bg-red-500/10' : 'bg-blue-500/10')
                        )}
                        onClick={() => {
                          selectMarker(marker)
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
                          {renderTags(annotation?.tags || [], true)}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex justify-end gap-1.5">
                            {renderLoadButton(marker)}
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
                    marker.id === markerState.activeMarkerId
                      ? (contentType === 'youtube'
                          ? 'border-red-500/60 bg-red-500/10'
                          : 'border-blue-500/60 bg-blue-500/10')
                      : 'border-border hover:bg-muted/45'
                  )}
                  onClick={(e) => {
                    if (e.target === e.currentTarget || e.target instanceof HTMLElement && !e.target.closest('button, input, textarea, [role="slider"]')) {
                      selectMarker(marker)
                      setEditingMarkerId(isExpanded ? null : marker.id)
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
                        {renderLoadButton(marker)}
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

