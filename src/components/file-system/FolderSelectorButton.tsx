'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fileSystemService, VideoFile } from '@/services/file-system'

interface FolderSelectorButtonProps {
  onFolderSelect: (videos: VideoFile[], directoryHandle: FileSystemDirectoryHandle) => void
  onError?: (error: Error) => void
  buttonText?: string
  className?: string
}

export function FolderSelectorButton({ onFolderSelect, onError, buttonText = 'Select Video Folder', className }: FolderSelectorButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectFolder = async () => {
    setIsLoading(true)
    try {
      console.log('Requesting directory access...')
      // Check if File System Access API is available
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API is not supported in your browser')
      }

      // Request directory access
      const handle = await fileSystemService.requestDirectoryAccess()
      console.log('Directory access granted:', handle)

      // Scan for video files
      console.log('Scanning for video files...')
      const videos = await fileSystemService.scanForVideos(handle)
      console.log('Found videos:', videos)

      onFolderSelect(videos, handle)
    } catch (error) {
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      if (error instanceof Error && onError) {
        onError(error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`flex items-center ${className ?? ''}`}>
      <Button
        onClick={handleSelectFolder}
        disabled={isLoading}
        variant="default"
        size="lg"
        className="w-full max-w-xs"
      >
        {isLoading ? 'Scanning folder...' : buttonText}
      </Button>
    </div>
  )
}