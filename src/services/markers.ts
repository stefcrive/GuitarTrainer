'use client'

import type { VideoMarkerState } from '@/types/video'
import {
  getDatabaseContext,
  queryAll,
  queryOne,
  runStatement,
  saveDatabase
} from '@/services/local-sql-db'

const LEGACY_MARKERS_DIR = '.markers'
export const MARKERS_UPDATED_EVENT = 'markers-updated'

export type MarkerRecord = {
  contentPath: string
  contentType: string
  markerState: VideoMarkerState
}

const CONTENT_IDENTITY_VERSION = 'v1'
const IDENTITY_SAMPLE_BYTES = 1024 * 1024

function getLegacyMarkersFileName(videoPath: string): string {
  return videoPath
    .split('/')
    .map(segment => segment.replace(/[^a-zA-Z0-9-_. ]/g, '_'))
    .join('_') + '.markers.json'
}

function getContentType(videoPath: string): string {
  if (videoPath.startsWith('youtube:')) return 'youtube'
  if (videoPath.startsWith('spotify:')) return 'spotify'
  return 'local'
}

function normalizeMarkerState(state: Partial<VideoMarkerState> | null): VideoMarkerState | null {
  if (!state) return null
  const markers = Array.isArray(state.markers) ? state.markers : []
  return {
    markers: markers.map((marker) => ({
      ...marker,
      audioBlob: undefined,
      isRecording: false
    })),
    annotations: Array.isArray(state.annotations) ? state.annotations : [],
    activeMarkerId: state.activeMarkerId ?? null,
    isLooping: state.isLooping ?? false
  }
}

async function getContentIdentityForFile(file: File): Promise<string> {
  const chunks: Blob[] = []
  const size = file.size
  chunks.push(file.slice(0, Math.min(size, IDENTITY_SAMPLE_BYTES)))
  if (size > IDENTITY_SAMPLE_BYTES * 2) {
    const middleStart = Math.max(0, Math.floor(size / 2) - Math.floor(IDENTITY_SAMPLE_BYTES / 2))
    chunks.push(file.slice(middleStart, Math.min(size, middleStart + IDENTITY_SAMPLE_BYTES)))
  }
  if (size > IDENTITY_SAMPLE_BYTES) {
    chunks.push(file.slice(Math.max(0, size - IDENTITY_SAMPLE_BYTES), size))
  }

  const buffers = await Promise.all(chunks.map(async (chunk) => new Uint8Array(await chunk.arrayBuffer())))
  const header = new TextEncoder().encode(`${CONTENT_IDENTITY_VERSION}:${file.size}:`)
  const totalLength = header.byteLength + buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  const merged = new Uint8Array(totalLength)
  merged.set(header, 0)
  let offset = header.byteLength
  for (const buffer of buffers) {
    merged.set(buffer, offset)
    offset += buffer.byteLength
  }

  const digest = await crypto.subtle.digest('SHA-256', merged)
  return `${CONTENT_IDENTITY_VERSION}:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function loadLegacyYoutubeMarkerState(videoPath: string): VideoMarkerState | null {
  if (typeof localStorage === 'undefined') return null
  const videoId = videoPath.replace('youtube:', '')
  const keys = [
    `youtube_markers_${videoId}`,
    `markers_youtube_${videoId}`,
    `markers-youtube-${videoId}`
  ]

  for (const key of keys) {
    const stored = localStorage.getItem(key)
    if (!stored) continue
    try {
      const parsed = JSON.parse(stored) as VideoMarkerState
      const normalized = normalizeMarkerState(parsed)
      if (normalized) return normalized
    } catch (error) {
      console.error('Error parsing legacy YouTube markers:', error)
    }
  }
  return null
}

function loadAllLegacyYoutubeMarkers(): MarkerRecord[] {
  if (typeof localStorage === 'undefined') return []
  const keys = Object.keys(localStorage).filter(key =>
    key.startsWith('youtube_markers_') ||
    key.startsWith('markers_youtube_') ||
    key.startsWith('markers-youtube-')
  )

  const results: MarkerRecord[] = []
  for (const key of keys) {
    const stored = localStorage.getItem(key)
    if (!stored) continue
    try {
      const parsed = JSON.parse(stored) as VideoMarkerState
      const markerState = normalizeMarkerState(parsed)
      if (!markerState || markerState.markers.length === 0) continue
      const videoId = key.replace(/^(youtube_markers_|markers_youtube_|markers-youtube-)/, '')
      results.push({
        contentPath: `youtube:${videoId}`,
        contentType: 'youtube',
        markerState
      })
    } catch (error) {
      console.error('Error parsing legacy YouTube markers:', error)
    }
  }
  return results
}

async function loadLegacyLocalMarkerState(
  directoryHandle: FileSystemDirectoryHandle,
  videoPath: string
): Promise<VideoMarkerState | null> {
  try {
    const markersDir = await directoryHandle.getDirectoryHandle(LEGACY_MARKERS_DIR)
    const markersFile = getLegacyMarkersFileName(videoPath)
    const fileHandle = await markersDir.getFileHandle(markersFile)
    const file = await fileHandle.getFile()
    const content = await file.text()
    return normalizeMarkerState(JSON.parse(content) as VideoMarkerState)
  } catch (error) {
    if ((error as any)?.name === 'NotFoundError') {
      return null
    }
    console.error('Error reading legacy markers file:', error)
    return null
  }
}

class MarkersService {
  async saveMarkersForFile(
    directoryHandle: FileSystemDirectoryHandle,
    videoPath: string,
    markerState: Partial<VideoMarkerState>,
    file: File
  ): Promise<void> {
    await this.saveMarkers(directoryHandle, videoPath, markerState)
    await this.saveContentIdentity(directoryHandle, videoPath, getContentType(videoPath), file)
  }

  async saveMarkers(
    directoryHandle: FileSystemDirectoryHandle,
    videoPath: string,
    markerState: Partial<VideoMarkerState>
  ): Promise<void> {
    try {
      const normalized = normalizeMarkerState(markerState)
      if (!normalized) return

      const context = await getDatabaseContext(directoryHandle)
      const { db } = context
      const contentType = getContentType(videoPath)
      const updatedAt = Date.now()

      runStatement(
        db,
        `INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(content_path) DO UPDATE SET
           content_type = excluded.content_type,
           marker_state = excluded.marker_state,
           updated_at = excluded.updated_at`,
        [videoPath, contentType, JSON.stringify(normalized), updatedAt]
      )
      await saveDatabase(context)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(MARKERS_UPDATED_EVENT, {
            detail: { contentPath: videoPath, contentType }
          })
        )
      }
    } catch (err) {
      console.error('Error saving markers:', err)
      throw new Error(`Unable to save markers for video: ${videoPath}`)
    }
  }

  async loadMarkersForFile(
    directoryHandle: FileSystemDirectoryHandle,
    videoPath: string,
    file: File
  ): Promise<VideoMarkerState | null> {
    const stateByPath = await this.loadMarkers(directoryHandle, videoPath)
    if (stateByPath) {
      await this.saveContentIdentity(directoryHandle, videoPath, getContentType(videoPath), file).catch((error) => {
        console.error('Error saving content identity:', error)
      })
      return stateByPath
    }

    try {
      const identityKey = await getContentIdentityForFile(file)
      const context = await getDatabaseContext(directoryHandle)
      const identityRow = queryOne<{ content_path: string }>(
        context.db,
        'SELECT content_path FROM marker_content_identities WHERE identity_key = ?',
        [identityKey]
      )
      if (!identityRow?.content_path || identityRow.content_path === videoPath) {
        return null
      }

      const movedRow = queryOne<{ marker_state: string }>(
        context.db,
        'SELECT marker_state FROM marker_states WHERE content_path = ?',
        [identityRow.content_path]
      )
      if (!movedRow?.marker_state) {
        return null
      }

      const movedState = normalizeMarkerState(JSON.parse(movedRow.marker_state) as VideoMarkerState)
      if (!movedState) return null

      await this.saveMarkers(directoryHandle, videoPath, movedState)
      await this.saveContentIdentity(directoryHandle, videoPath, getContentType(videoPath), file)
      return movedState
    } catch (error) {
      console.error('Error loading markers by content identity:', error)
      return null
    }
  }

  async loadMarkers(
    directoryHandle: FileSystemDirectoryHandle,
    videoPath: string
  ): Promise<VideoMarkerState | null> {
    try {
      const { db } = await getDatabaseContext(directoryHandle)
      const row = queryOne<{ marker_state: string }>(
        db,
        'SELECT marker_state FROM marker_states WHERE content_path = ?',
        [videoPath]
      )
      if (row?.marker_state) {
        return normalizeMarkerState(JSON.parse(row.marker_state) as VideoMarkerState)
      }

      const legacyState = videoPath.startsWith('youtube:')
        ? loadLegacyYoutubeMarkerState(videoPath)
        : await loadLegacyLocalMarkerState(directoryHandle, videoPath)

      if (legacyState) {
        await this.saveMarkers(directoryHandle, videoPath, legacyState)
      }

      return legacyState
    } catch (err) {
      return null
    }
  }

  async loadAllMarkers(
    directoryHandle: FileSystemDirectoryHandle,
    contentType?: string
  ): Promise<MarkerRecord[]> {
    const { db } = await getDatabaseContext(directoryHandle)
    const rows = queryAll<{
      content_path: string
      content_type: string
      marker_state: string
    }>(
      db,
      contentType
        ? 'SELECT content_path, content_type, marker_state FROM marker_states WHERE content_type = ?'
        : 'SELECT content_path, content_type, marker_state FROM marker_states',
      contentType ? [contentType] : []
    )

    let records: MarkerRecord[] = []
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.marker_state) as VideoMarkerState
        const markerState = normalizeMarkerState(parsed)
        if (!markerState) continue
        records.push({
          contentPath: row.content_path,
          contentType: row.content_type,
          markerState
        })
      } catch (error) {
        console.error('Error parsing marker state from database:', error)
      }
    }

    if (contentType === 'youtube') {
      const legacyRecords = loadAllLegacyYoutubeMarkers()
      const existingPaths = new Set(records.map((record) => record.contentPath))
      for (const record of legacyRecords) {
        if (existingPaths.has(record.contentPath)) continue
        await this.saveMarkers(directoryHandle, record.contentPath, record.markerState)
        records.push(record)
      }
    }

    return records
  }

  private async saveContentIdentity(
    directoryHandle: FileSystemDirectoryHandle,
    videoPath: string,
    contentType: string,
    file: File
  ): Promise<void> {
    if (videoPath.startsWith('youtube:') || videoPath.startsWith('spotify:')) return
    const identityKey = await getContentIdentityForFile(file)
    const context = await getDatabaseContext(directoryHandle)
    runStatement(
      context.db,
      `INSERT INTO marker_content_identities (identity_key, content_path, content_type, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(identity_key) DO UPDATE SET
         content_path = excluded.content_path,
         content_type = excluded.content_type,
         updated_at = excluded.updated_at`,
      [identityKey, videoPath, contentType, Date.now()]
    )
    await saveDatabase(context)
  }
}

export const markersService = new MarkersService()
