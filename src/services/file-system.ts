'use client'

import { FileSystemVideo } from '@/types/video'
import { FileSystemAudio } from '@/types/audio'

interface JSONObject {
  [key: string]: any
}

class FileSystemService {
  private videoExtensions = new Set(['.mp4', '.webm', '.ogg', '.mov'])
  private audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac'])

  async scanForAudioFiles(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemAudio[]> {
    return this.getAudioFilesFromDirectory(directoryHandle)
  }

  async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in your browser')
    }
    return window.showDirectoryPicker()
  }

  async scanForVideos(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemVideo[]> {
    return this.getVideosFromDirectory(directoryHandle)
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
export type { FileSystemVideo as VideoFile }