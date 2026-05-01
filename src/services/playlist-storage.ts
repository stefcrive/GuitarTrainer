'use client'

import {
  databaseFileExists,
  getDatabaseContext,
  queryAll,
  runStatement,
  saveDatabase
} from '@/services/local-sql-db'

interface PlaylistData {
  id: string
  title: string
  description?: string
}

interface PlaylistStorage {
  playlists: PlaylistData[]
  lastUpdated: number
}

const LEGACY_PLAYLIST_FILE = 'youtube-playlists.json'

async function readLegacyPlaylists(
  rootHandle: FileSystemDirectoryHandle
): Promise<PlaylistData[]> {
  try {
    const fileHandle = await rootHandle.getFileHandle(LEGACY_PLAYLIST_FILE)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const data: PlaylistStorage = JSON.parse(content)
    return Array.isArray(data.playlists) ? data.playlists : []
  } catch (error) {
    if ((error as any)?.name === 'NotFoundError') {
      return []
    }
    console.error('Error reading legacy playlists:', error)
    return []
  }
}

export async function savePlaylistsToFolder(
  rootHandle: FileSystemDirectoryHandle,
  playlists: PlaylistData[]
): Promise<void> {
  try {
    const context = await getDatabaseContext(rootHandle)
    const updatedAt = Date.now()

    context.db.exec('BEGIN')
    try {
      runStatement(context.db, 'DELETE FROM youtube_playlists')

      for (const playlist of playlists) {
        runStatement(
          context.db,
          `INSERT INTO youtube_playlists (id, title, description, updated_at)
           VALUES (?, ?, ?, ?)`,
          [playlist.id, playlist.title, playlist.description ?? '', updatedAt]
        )
      }
      context.db.exec('COMMIT')
    } catch (error) {
      context.db.exec('ROLLBACK')
      throw error
    }
    await saveDatabase(context)
  } catch (error) {
    console.error('Error saving playlists to database:', error)
    throw error
  }
}

export async function loadPlaylistsFromFolder(
  rootHandle: FileSystemDirectoryHandle
): Promise<PlaylistData[]> {
  try {
    const context = await getDatabaseContext(rootHandle)
    let rows = queryAll<{ id: string; title: string; description: string }>(
      context.db,
      'SELECT id, title, description FROM youtube_playlists ORDER BY updated_at DESC'
    )

    if (rows.length === 0) {
      const legacy = await readLegacyPlaylists(rootHandle)
      if (legacy.length > 0) {
        await savePlaylistsToFolder(rootHandle, legacy)
        rows = legacy.map((playlist) => ({
          id: playlist.id,
          title: playlist.title,
          description: playlist.description ?? ''
        }))
      }
    }

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? ''
    }))
  } catch (error) {
    console.error('Error loading playlists from database:', error)
    throw error
  }
}

export async function playlistFileExists(
  rootHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  return databaseFileExists(rootHandle)
}
