'use client'

import { FileSystemVideo } from '@/types/video'
import { FileSystemAudio } from '@/types/audio'
import { createMemoryDirectoryHandleFromFiles } from '@/services/memory-file-system'
import { skipMaterialEntry } from '@/lib/practice-material'

interface JSONObject {
  [key: string]: any
}

class FileSystemService {
  private videoExtensions = new Set(['.mp4', '.webm', '.mov'])
  private audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.aiff'])

  async scanForAudioFiles(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemAudio[]> {
    const audioFiles = await this.getAudioFilesFromDirectory(directoryHandle)
    this.saveCachedAudioFiles(directoryHandle, audioFiles)
    return audioFiles
  }

  async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
    if ('showDirectoryPicker' in window) {
      return window.showDirectoryPicker({ mode: 'readwrite' })
    }
    const files = await this.requestDirectoryAccessWithInput()
    return createMemoryDirectoryHandleFromFiles(files)
  }

  private async requestDirectoryAccessWithInput(): Promise<FileList> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
      input.setAttribute('mozdirectory', '')
      input.style.position = 'fixed'
      input.style.top = '-1000px'

      const cleanup = () => {
        input.removeEventListener('change', handleChange)
        input.removeEventListener('cancel', handleCancel)
        input.remove()
      }

      const handleChange = () => {
        const files = input.files
        cleanup()
        if (!files || files.length === 0) {
          reject(new Error('No folder selected'))
          return
        }
        resolve(files)
      }

      const handleCancel = () => {
        cleanup()
        reject(new DOMException('Folder selection canceled', 'AbortError'))
      }

      input.addEventListener('change', handleChange, { once: true })
      input.addEventListener('cancel', handleCancel, { once: true })

      document.body.appendChild(input)
      input.click()
    })
  }

  async scanForVideos(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemVideo[]> {
    const videos = await this.getVideosFromDirectory(directoryHandle)
    this.saveCachedVideos(directoryHandle, videos)
    return videos
  }

  getCachedVideos(directoryHandle: FileSystemDirectoryHandle): FileSystemVideo[] | null {
    return this.readScanCache<FileSystemVideo>(directoryHandle, 'videos')
  }

  getCachedAudioFiles(directoryHandle: FileSystemDirectoryHandle): FileSystemAudio[] | null {
    return this.readScanCache<FileSystemAudio>(directoryHandle, 'audio')
  }

  private saveCachedVideos(directoryHandle: FileSystemDirectoryHandle, videos: FileSystemVideo[]) {
    this.writeScanCache(directoryHandle, 'videos', videos.map(({ id, type, name, path }) => ({
      id,
      type,
      name,
      path
    })))
  }

  private saveCachedAudioFiles(directoryHandle: FileSystemDirectoryHandle, audioFiles: FileSystemAudio[]) {
    this.writeScanCache(directoryHandle, 'audio', audioFiles.map(({ id, type, name, path, fileType }) => ({
      id,
      type,
      name,
      path,
      fileType
    })))
  }

  private readScanCache<T>(directoryHandle: FileSystemDirectoryHandle, kind: 'videos' | 'audio'): T[] | null {
    if (typeof window === 'undefined') return null

    try {
      const raw = window.localStorage.getItem(this.getScanCacheKey(directoryHandle, kind))
      if (!raw) return null
      const parsed = JSON.parse(raw) as { version?: number; items?: T[] }
      return parsed.version === 2 && Array.isArray(parsed.items) ? parsed.items : null
    } catch (error) {
      console.warn('Unable to read scan cache:', error)
      return null
    }
  }

  private writeScanCache<T extends { id: string; name: string; path: string; type: string }>(
    directoryHandle: FileSystemDirectoryHandle,
    kind: 'videos' | 'audio',
    items: T[]
  ) {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(
        this.getScanCacheKey(directoryHandle, kind),
        JSON.stringify({ version: 2, updatedAt: Date.now(), items })
      )
    } catch (error) {
      console.warn('Unable to write scan cache:', error)
    }
  }

  private getScanCacheKey(directoryHandle: FileSystemDirectoryHandle, kind: 'videos' | 'audio') {
    return `guitar-trainer:${kind}:scan-cache:${directoryHandle.name}`
  }

  async isVideoFile(fileHandle: FileSystemFileHandle): Promise<boolean> {
    const file = await fileHandle.getFile()
    return this.videoExtensions.has(this.getFileExtension(file.name).toLowerCase())
  }

  async isAudioFile(fileHandle: FileSystemFileHandle): Promise<boolean> {
    const file = await fileHandle.getFile()
    return this.audioExtensions.has(this.getFileExtension(file.name).toLowerCase())
  }

  getFileExtension(filename: string): string {
    return filename.slice(filename.lastIndexOf('.'))
  }

  async getVideosFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemVideo[]> {
    const videos: FileSystemVideo[] = []
    
    const processEntry = async (handle: FileSystemDirectoryHandle, path: string = ''): Promise<void> => {
      try {
        for await (const entry of handle.values()) {
          if (skipMaterialEntry(entry.name)) continue
          const entryPath = path ? `${path}/${entry.name}` : entry.name
          
          if (entry.kind === 'directory') {
            const dirHandle = await handle.getDirectoryHandle(entry.name)
            await processEntry(dirHandle, entryPath)
          } else if (entry.kind === 'file') {
            if (this.videoExtensions.has(this.getFileExtension(entry.name).toLowerCase())) {
              try {
                const fileHandle = await handle.getFileHandle(entry.name)
                videos.push({
                  id: entryPath,
                  type: 'file',
                  name: entry.name,
                  path: entryPath,
                  handle: fileHandle
                })
              } catch (err) {
                console.error('Error processing video:', err)
                videos.push({
                  id: entryPath,
                  type: 'file',
                  name: entry.name,
                  path: entryPath
                })
              }
            }
          }
        }
      } catch (err) {
        console.error('Error processing directory:', err)
      }
    }

    await processEntry(directoryHandle)
    return videos
  }

  async getAudioFilesFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemAudio[]> {
    const audioFiles: FileSystemAudio[] = []
    
    const processEntry = async (handle: FileSystemDirectoryHandle, path: string = ''): Promise<void> => {
      try {
        for await (const entry of handle.values()) {
          if (skipMaterialEntry(entry.name)) continue
          const entryPath = path ? `${path}/${entry.name}` : entry.name
          
          if (entry.kind === 'directory') {
            const dirHandle = await handle.getDirectoryHandle(entry.name)
            await processEntry(dirHandle, entryPath)
          } else if (entry.kind === 'file') {
            if (this.audioExtensions.has(this.getFileExtension(entry.name).toLowerCase())) {
              try {
                const fileHandle = await handle.getFileHandle(entry.name)
                const extension = this.getFileExtension(entry.name).toLowerCase().slice(1)
                const fileType = extension as 'mp3' | 'wav' | 'aiff'
                audioFiles.push({
                  id: entryPath,
                  type: 'file',
                  name: entry.name,
                  path: entryPath,
                  handle: fileHandle,
                  fileType
                })
              } catch (err) {
                console.error('Error processing audio file:', err)
                audioFiles.push({
                  id: entryPath,
                  type: 'file',
                  name: entry.name,
                  path: entryPath
                })
              }
            }
          }
        }
      } catch (err) {
        console.error('Error processing directory:', err)
      }
    }

    await processEntry(directoryHandle)
    return audioFiles
  }

  async createMetadataDirectory(rootHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
    try {
      return await rootHandle.getDirectoryHandle('.metadata', { create: true })
    } catch (error) {
      console.error('Error creating metadata directory:', error)
      throw error
    }
  }

  async readJSONFile<T extends JSONObject>(
    directoryHandle: FileSystemDirectoryHandle,
    filename: string
  ): Promise<T | null> {
    try {
      const fileHandle = await directoryHandle.getFileHandle(filename)
      const file = await fileHandle.getFile()
      const content = await file.text()
      return JSON.parse(content) as T
    } catch (error) {
      if ((error as any).name === 'NotFoundError') {
        return null
      }
      throw error
    }
  }
}

export const fileSystemService = new FileSystemService()
export type { FileSystemVideo as VideoFile, FileSystemAudio as AudioFile }
