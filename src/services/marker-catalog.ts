'use client'

import type { AudioAnnotation, AudioMarker, AudioMetadata } from '@/types/audio'
import type { MarkerLearningMetadata } from '@/types/learning'
import type { TimeMarker, VideoAnnotation, VideoMarkerState } from '@/types/video'
import { getAllAudioMetadata, getAudioMetadata, saveAudioMetadata } from '@/services/audio-metadata'
import { markersService } from '@/services/markers'
import { loadDocumentLibrary, loadDocumentState, saveDocumentState } from '@/services/documents'
import type { DocumentMarker, LibraryDocument } from '@/types/document'

export type MarkerCatalogContentType = 'local' | 'youtube' | 'audio' | 'spotify' | 'book'

type MarkerStateStorage = {
  kind: 'marker-state'
  handle: FileSystemDirectoryHandle
}

type AudioMetadataStorage = {
  kind: 'audio-metadata'
  handle: FileSystemDirectoryHandle
}

export type MarkerCatalogStorage = MarkerStateStorage | AudioMetadataStorage | { kind: 'document'; handle: FileSystemDirectoryHandle }

export type CatalogMarker = TimeMarker | AudioMarker
export type CatalogAnnotation = VideoAnnotation | AudioAnnotation

export interface MarkerCatalogItem {
  markerKey: string
  contentPath: string
  contentType: MarkerCatalogContentType
  sourceTitle: string
  markerTitle: string
  marker: CatalogMarker
  annotation?: CatalogAnnotation
  tags: string[]
  storage: MarkerCatalogStorage
  document?: LibraryDocument
  documentMarker?: DocumentMarker
}

export interface LoadMarkerCatalogOptions {
  rootHandle?: FileSystemDirectoryHandle | null
  audioRootHandle?: FileSystemDirectoryHandle | null
  includeAudioFromVideoRoot?: boolean
  includeDocuments?: boolean
}

export function getMarkerKey(contentPath: string, markerId: string): string {
  return `${contentPath}::${markerId}`
}

export function getContentTitleFromPath(path: string): string {
  if (path.startsWith('youtube:')) return `YouTube ${path.replace('youtube:', '')}`
  if (path.startsWith('spotify:')) return 'Spotify Track'
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

export async function loadMarkerCatalog({
  rootHandle,
  audioRootHandle,
  includeAudioFromVideoRoot = false,
  includeDocuments = true
}: LoadMarkerCatalogOptions): Promise<MarkerCatalogItem[]> {
  const items: MarkerCatalogItem[] = []
  const seen = new Set<string>()

  const markerStateHandle = rootHandle ?? audioRootHandle ?? null
  if (markerStateHandle) {
    const records = await markersService.loadAllMarkers(markerStateHandle)
    for (const record of records) {
      const contentType = normalizeCatalogContentType(record.contentType, record.contentPath)
      const sourceTitle = getStoredSourceTitle(record.contentPath) ?? getContentTitleFromPath(record.contentPath)
      addMarkerStateItems(items, seen, {
        contentPath: record.contentPath,
        contentType,
        sourceTitle,
        markerState: record.markerState,
        storage: { kind: 'marker-state', handle: markerStateHandle }
      })
    }
  }

  const audioHandles = uniqueHandles([
    audioRootHandle,
    includeAudioFromVideoRoot ? rootHandle : null,
    rootHandle && !audioRootHandle ? rootHandle : null
  ])

  for (const handle of audioHandles) {
    const metadataMap = await getAllAudioMetadata(handle)
    for (const metadata of Object.values(metadataMap)) {
      const markers = Array.isArray(metadata.markers) ? metadata.markers : []
      if (markers.length === 0) continue
      const contentType: MarkerCatalogContentType = metadata.path?.startsWith('spotify:') ? 'spotify' : 'audio'
      const sourceTitle = metadata.title || getContentTitleFromPath(metadata.path)
      addAudioMetadataItems(items, seen, {
        metadata,
        contentType,
        sourceTitle,
        storage: { kind: 'audio-metadata', handle }
      })
    }
  }

  if (includeDocuments && markerStateHandle) items.push(...await loadBookMarkerCatalog(markerStateHandle))

  return items.sort((a, b) => {
    const domainCompare = (a.marker.learning?.domain ?? '').localeCompare(b.marker.learning?.domain ?? '')
    if (domainCompare !== 0) return domainCompare
    const sourceCompare = a.sourceTitle.localeCompare(b.sourceTitle)
    if (sourceCompare !== 0) return sourceCompare
    return (a.documentMarker?.page ?? a.marker.startTime) - (b.documentMarker?.page ?? b.marker.startTime)
  })
}

export async function updateCatalogMarker(
  item: MarkerCatalogItem,
  updater: (marker: CatalogMarker) => CatalogMarker
): Promise<void> {
  if (item.storage.kind === 'document') {
    const state = await loadDocumentState(item.storage.handle, item.contentPath)
    const current = state?.markers.find(marker => marker.id === item.marker.id)
    if (!state || !current) throw new Error('This book marker no longer exists. Refresh the library.')
    const updated = updater({ ...item.marker, learning: current.learning, completionDegree: current.completionDegree })
    await saveDocumentState(item.storage.handle, item.contentPath, { ...state, markers: state.markers.map(marker =>
      marker.id === item.marker.id ? { ...marker, learning: updated.learning, completionDegree: updated.completionDegree ?? 0 } : marker
    ) })
    return
  }
  if (item.storage.kind === 'marker-state') {
    const state = await markersService.loadMarkers(item.storage.handle, item.contentPath)
    if (!state) return
    const nextState: VideoMarkerState = {
      ...state,
      markers: state.markers.map((marker) =>
        marker.id === item.marker.id ? updater(marker) as TimeMarker : marker
      )
    }
    await markersService.saveMarkers(item.storage.handle, item.contentPath, nextState)
    return
  }

  const audioFile = {
    id: item.contentPath,
    type: 'file' as const,
    name: getContentTitleFromPath(item.contentPath),
    path: item.contentPath
  }
  const metadata = await getAudioMetadata(audioFile, item.storage.handle)
  await saveAudioMetadata(
    audioFile,
    {
      markers: metadata.markers.map((marker) =>
        marker.id === item.marker.id ? updater(marker) as AudioMarker : marker
      )
    },
    item.storage.handle
  )
}

// Keep page positions on the document marker; time fields are only a catalog adapter.
export function bookCatalogItem(entry: LibraryDocument, marker: DocumentMarker, root: FileSystemDirectoryHandle): MarkerCatalogItem {
  const annotation = { id: marker.id, markerId: marker.id, text: marker.notes, tags: marker.tags, timestamp: 0 }
  const adapted: TimeMarker = { id: marker.id, title: marker.title, startTime: 0, endTime: 0, completionDegree: marker.completionDegree, learning: marker.learning }
  return { markerKey: getMarkerKey(entry.path, marker.id), contentPath: entry.path, contentType: 'book', sourceTitle: entry.name,
    markerTitle: marker.title, marker: adapted, annotation, tags: collectTags(annotation),
    storage: { kind: 'document', handle: root }, document: entry, documentMarker: marker }
}

export async function loadBookMarkerCatalog(root: FileSystemDirectoryHandle): Promise<MarkerCatalogItem[]> {
  const records = await loadDocumentLibrary(root)
  return records.flatMap(({ entry, state }) => (state?.markers ?? []).map(marker => bookCatalogItem(entry, marker, root)))
}

export async function updateCatalogMarkerLearning(
  item: MarkerCatalogItem,
  learning: MarkerLearningMetadata
): Promise<void> {
  await updateCatalogMarker(item, (marker) => ({
    ...marker,
    learning: mergeLearning(marker.learning, learning)
  }))
}

export async function updateCatalogMarkerProgress(
  item: MarkerCatalogItem,
  completionDegree: number
): Promise<void> {
  await updateCatalogMarker(item, (marker) => ({
    ...marker,
    completionDegree: Math.max(0, Math.min(100, Math.round(completionDegree)))
  }))
}

function addMarkerStateItems(
  items: MarkerCatalogItem[],
  seen: Set<string>,
  params: {
    contentPath: string
    contentType: MarkerCatalogContentType
    sourceTitle: string
    markerState: VideoMarkerState
    storage: MarkerStateStorage
  }
) {
  for (const [index, marker] of params.markerState.markers.entries()) {
    const markerKey = getMarkerKey(params.contentPath, marker.id)
    if (seen.has(markerKey)) continue
    seen.add(markerKey)
    const annotation = params.markerState.annotations.find((item) => item.markerId === marker.id)
    items.push({
      markerKey,
      contentPath: params.contentPath,
      contentType: params.contentType,
      sourceTitle: params.sourceTitle,
      markerTitle: getMarkerTitle(marker, annotation, index),
      marker,
      annotation,
      tags: collectTags(annotation),
      storage: params.storage
    })
  }
}

function addAudioMetadataItems(
  items: MarkerCatalogItem[],
  seen: Set<string>,
  params: {
    metadata: AudioMetadata
    contentType: MarkerCatalogContentType
    sourceTitle: string
    storage: AudioMetadataStorage
  }
) {
  for (const [index, marker] of params.metadata.markers.entries()) {
    const markerKey = getMarkerKey(params.metadata.path, marker.id)
    if (seen.has(markerKey)) continue
    seen.add(markerKey)
    const annotation = params.metadata.annotations.find((item) => item.markerId === marker.id)
    items.push({
      markerKey,
      contentPath: params.metadata.path,
      contentType: params.contentType,
      sourceTitle: params.sourceTitle,
      markerTitle: getMarkerTitle(marker, annotation, index),
      marker,
      annotation,
      tags: collectTags(annotation),
      storage: params.storage
    })
  }
}

function getMarkerTitle(
  marker: CatalogMarker,
  annotation: CatalogAnnotation | undefined,
  index: number
): string {
  return marker.title?.trim() || annotation?.text?.split('\n')[0]?.replace(/^Summary:\s*/i, '').trim() || `Marker ${index + 1}`
}

function collectTags(annotation?: CatalogAnnotation): string[] {
  // Learning topics remain descriptive metadata, not extra library filter tags.
  return Array.from(new Set((annotation?.tags ?? [])
    .map((tag) => tag.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function normalizeCatalogContentType(contentType: string, contentPath: string): MarkerCatalogContentType {
  if (contentPath.startsWith('youtube:')) return 'youtube'
  if (contentPath.startsWith('spotify:')) return 'spotify'
  if (contentType === 'youtube' || contentType === 'audio' || contentType === 'spotify') return contentType
  return 'local'
}

function uniqueHandles(handles: Array<FileSystemDirectoryHandle | null | undefined>): FileSystemDirectoryHandle[] {
  const result: FileSystemDirectoryHandle[] = []
  for (const handle of handles) {
    if (!handle || result.includes(handle)) continue
    result.push(handle)
  }
  return result
}

function getStoredSourceTitle(contentPath: string): string | null {
  if (typeof localStorage === 'undefined' || !contentPath.startsWith('youtube:')) return null
  return localStorage.getItem(`youtube_title_${contentPath.replace('youtube:', '')}`)
}

function mergeLearning(
  current: MarkerLearningMetadata | undefined,
  patch: MarkerLearningMetadata
): MarkerLearningMetadata {
  const next = { ...(current ?? {}), ...patch }
  if (patch.domain === undefined) {
    delete next.domain
  }
  return next
}
