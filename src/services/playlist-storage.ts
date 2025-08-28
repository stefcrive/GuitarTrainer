interface PlaylistData {
  id: string
  title: string
  description?: string
}

interface PlaylistStorage {
  playlists: PlaylistData[]
  lastUpdated: number
}

const PLAYLIST_FILE_NAME = 'youtube-playlists.json'

export async function savePlaylistsToFolder(
  rootHandle: FileSystemDirectoryHandle,
  playlists: PlaylistData[]
): Promise<void> {
  try {
    const fileHandle = await rootHandle.getFileHandle(PLAYLIST_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()
    
    const data: PlaylistStorage = {
      playlists,
      lastUpdated: Date.now()
    }
    
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
    
    console.log(`Saved ${playlists.length} playlists to ${PLAYLIST_FILE_NAME}`)
  } catch (error) {
    console.error('Error saving playlists to folder:', error)
    throw error
  }
}

export async function loadPlaylistsFromFolder(
  rootHandle: FileSystemDirectoryHandle
): Promise<PlaylistData[]> {
  try {
    const fileHandle = await rootHandle.getFileHandle(PLAYLIST_FILE_NAME)
    const file = await fileHandle.getFile()
    const content = await file.text()
    
    const data: PlaylistStorage = JSON.parse(content)
    
    console.log(`Loaded ${data.playlists.length} playlists from ${PLAYLIST_FILE_NAME}`)
    return data.playlists
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      console.log('No playlist file found, returning empty array')
      return []
    }
    
    console.error('Error loading playlists from folder:', error)
    throw error
  }
}

export async function playlistFileExists(
  rootHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    await rootHandle.getFileHandle(PLAYLIST_FILE_NAME)
    return true
  } catch (error) {
    return false
  }
}