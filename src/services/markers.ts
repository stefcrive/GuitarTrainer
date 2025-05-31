import type { VideoMarkerState } from '@/types/video'

function getMarkersFileName(videoPath: string): string {
  return videoPath
    .split('/')
    .map(segment => segment.replace(/[^a-zA-Z0-9-_. ]/g, '_'))
    .join('_') + '.markers.json'
}

class MarkersService {
  async createMarkersDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
    return directoryHandle.getDirectoryHandle('.markers', { create: true })
  }

  async writeJSONFile(directoryHandle: FileSystemDirectoryHandle, filename: string, data: unknown): Promise<void> {
    try {
      const cleanFilename = filename.replace(/^[./]+/, '')
      const fileHandle = await directoryHandle.getFileHandle(cleanFilename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(data, null, 2))
      await writable.close()
    } catch (err) {
      console.error('Error writing JSON file:', err)
      throw new Error(`Unable to write JSON file: ${filename}`)
    }
  }

  async readJSONFile<T>(directoryHandle: FileSystemDirectoryHandle, filename: string): Promise<T | null> {
    try {
      const cleanFilename = filename.replace(/^[./]+/, '')
      const fileHandle = await directoryHandle.getFileHandle(cleanFilename)
      const file = await fileHandle.getFile()
      const content = await file.text()
      return JSON.parse(content)
    } catch (err) {
      if ((err as any)?.name === 'NotFoundError') {
        return null
      }
      console.error('Error reading JSON file:', err)
      throw new Error(`Unable to read JSON file: ${filename}`)
    }
  }

  async saveMarkers(directoryHandle: FileSystemDirectoryHandle, videoPath: string, markerState: VideoMarkerState): Promise<void> {
    try {
      const markersDir = await this.createMarkersDirectory(directoryHandle)
      const markersFile = getMarkersFileName(videoPath)
      await this.writeJSONFile(markersDir, markersFile, markerState)
    } catch (err) {
      console.error('Error saving markers:', err)
      throw new Error(`Unable to save markers for video: ${videoPath}`)
    }
  }

  async loadMarkers(directoryHandle: FileSystemDirectoryHandle, videoPath: string): Promise<VideoMarkerState | null> {
    try {
      const markersDir = await this.createMarkersDirectory(directoryHandle)
      const markersFile = getMarkersFileName(videoPath)
      return await this.readJSONFile<VideoMarkerState>(markersDir, markersFile)
    } catch (err) {
      // Return null if markers don't exist yet
      return null
    }
  }
}

export const markersService = new MarkersService()