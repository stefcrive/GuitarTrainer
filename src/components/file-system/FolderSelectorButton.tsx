'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fileSystemService, VideoFile } from '@/services/file-system'

interface FolderSelectorButtonProps {
  onFolderSelect: (videos: VideoFile[], directoryHandle: FileSystemDirectoryHandle) => void | Promise<void>
  onError?: (error: Error) => void
  buttonText?: string
  className?: string
}

export function FolderSelectorButton({ onFolderSelect, onError, buttonText = 'Select Video Folder', className }: FolderSelectorButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSelecting, setIsSelecting] = useState(false)

  const handleSelectFolder = async () => {
    setIsLoading(true)
    setIsSelecting(true)
    setErrorMessage('')
    try {
      console.log('Requesting directory access...')
      if (!('showDirectoryPicker' in window)) {
        console.log('File System Access API not supported; using browser folder picker fallback.')
      }

      // Request directory access
      const handle = await fileSystemService.requestDirectoryAccess()
      setIsSelecting(false)
      console.log('Directory access granted:', handle)

      // Scan for video files
      console.log('Scanning for video files...')
      const videos = await fileSystemService.scanForVideos(handle)
      console.log('Found videos:', videos)

      await onFolderSelect(videos, handle)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open this folder.')
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
      setIsSelecting(false)
    }
  }

  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ''}`}>
      <Button
        onClick={handleSelectFolder}
        disabled={isLoading}
        variant="default"
        size="lg"
        className="w-full max-w-xs"
      >
        {isLoading ? (isSelecting ? 'Selecting folder...' : 'Scanning folder...') : buttonText}
      </Button>
      {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  )
}
