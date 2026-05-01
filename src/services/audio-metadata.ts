'use client'

import type { AudioMetadata, AudioFile, AudioMarker } from '@/types/audio'
import {
  getDatabaseContext,
  queryAll,
  queryOne,
  runStatement,
  saveDatabase
} from '@/services/local-sql-db'

const LEGACY_METADATA_FILE = 'audio-metadata.json'
const legacyCache = new WeakMap<
  FileSystemDirectoryHandle,
  Promise<Record<string, AudioMetadata> | null>
>()

function defaultMetadata(audioFile: AudioFile): AudioMetadata {
  return {
    id: audioFile.path,
    path: audioFile.path,
    title: audioFile.name,
    tags: [],
    loopRegion: {
      start: 0,
      end: 0,
      enabled: false
    },
    markers: [],
    annotations: [],
    playbackRate: 1
  }
}

function normalizeMetadata(
  metadata: Partial<AudioMetadata> | null,
  audioFile?: AudioFile
): AudioMetadata {
  const fallbackPath = audioFile?.path ?? metadata?.path ?? ''
  const fallbackTitle = audioFile?.name ?? metadata?.title ?? fallbackPath
  return {
    id: metadata?.id ?? fallbackPath,
    path: metadata?.path ?? fallbackPath,
    title: metadata?.title ?? fallbackTitle,
    tags: Array.isArray(metadata?.tags) ? metadata?.tags : [],
    loopRegion: metadata?.loopRegion ?? {
      start: 0,
      end: 0,
      enabled: false
    },
    markers: Array.isArray(metadata?.markers) ? metadata?.markers : [],
    annotations: Array.isArray(metadata?.annotations) ? metadata?.annotations : [],
    playbackRate: typeof metadata?.playbackRate === 'number' ? metadata?.playbackRate : 1,
    volume: metadata?.volume
  }
}

function stripAudioBlobs(markers: AudioMarker[]): AudioMarker[] {
  return markers.map((marker) => ({
    ...marker,
    audioBlob: undefined,
    isRecording: false
  }))
}

async function readLegacyMetadataFile(
  directoryHandle: FileSystemDirectoryHandle
): Promise<Record<string, AudioMetadata> | null> {
  const cached = legacyCache.get(directoryHandle)
  if (cached) return cached

  const promise = (async () => {
    try {
      const fileHandle = await directoryHandle.getFileHandle(LEGACY_METADATA_FILE)
      const file = await fileHandle.getFile()
      const content = await file.text()
      return content ? (JSON.parse(content) as Record<string, AudioMetadata>) : {}
    } catch (error) {
      if ((error as any)?.name === 'NotFoundError') {
        return null
      }
      console.error('Error reading legacy audio metadata file:', error)
      return null
    }
  })()

  legacyCache.set(directoryHandle, promise)
  return promise
}

async function upsertMetadata(
  directoryHandle: FileSystemDirectoryHandle,
  metadata: AudioMetadata
) {
  const context = await getDatabaseContext(directoryHandle)
  const updatedAt = Date.now()

  runStatement(
    context.db,
    `INSERT INTO audio_metadata (path, metadata, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
    [metadata.path, JSON.stringify(metadata), updatedAt]
  )
  await saveDatabase(context)
}

export async function getAudioMetadata(
  audioFile: AudioFile,
  directoryHandle: FileSystemDirectoryHandle
): Promise<AudioMetadata> {
  const context = await getDatabaseContext(directoryHandle)
  const row = queryOne<{ metadata: string }>(
    context.db,
    'SELECT metadata FROM audio_metadata WHERE path = ?',
    [audioFile.path]
  )

  if (row?.metadata) {
    return normalizeMetadata(JSON.parse(row.metadata) as AudioMetadata, audioFile)
  }

  const legacy = await readLegacyMetadataFile(directoryHandle)
  const legacyEntry = legacy?.[audioFile.path]
  if (legacyEntry) {
    const normalized = normalizeMetadata(legacyEntry, audioFile)
    normalized.markers = stripAudioBlobs(normalized.markers || [])
    await upsertMetadata(directoryHandle, normalized)
    return normalized
  }

  return defaultMetadata(audioFile)
}

export async function saveAudioMetadata(
  audioFile: AudioFile,
  metadata: Partial<AudioMetadata>,
  directoryHandle: FileSystemDirectoryHandle
) {
  const existingMetadata = await getAudioMetadata(audioFile, directoryHandle)
  const nextMetadata = normalizeMetadata(
    {
      ...existingMetadata,
      ...metadata,
      id: audioFile.path,
      path: audioFile.path
    },
    audioFile
  )
  nextMetadata.markers = stripAudioBlobs(nextMetadata.markers || [])

  await upsertMetadata(directoryHandle, nextMetadata)
}

export async function getAllAudioMetadata(
  directoryHandle: FileSystemDirectoryHandle
): Promise<Record<string, AudioMetadata>> {
  const context = await getDatabaseContext(directoryHandle)
  let rows = queryAll<{ path: string; metadata: string }>(
    context.db,
    'SELECT path, metadata FROM audio_metadata'
  )

  if (rows.length === 0) {
    const legacy = await readLegacyMetadataFile(directoryHandle)
    if (legacy) {
      for (const [path, metadata] of Object.entries(legacy)) {
        const normalized = normalizeMetadata({ ...metadata, path })
        normalized.markers = stripAudioBlobs(normalized.markers || [])
        await upsertMetadata(directoryHandle, normalized)
      }
      rows = Object.entries(legacy).map(([path, metadata]) => ({
        path,
        metadata: JSON.stringify(normalizeMetadata({ ...metadata, path }))
      }))
    }
  }

  return rows.reduce<Record<string, AudioMetadata>>((acc, row) => {
    const parsed = JSON.parse(row.metadata) as AudioMetadata
    acc[row.path] = normalizeMetadata({ ...parsed, path: row.path })
    return acc
  }, {})
}
