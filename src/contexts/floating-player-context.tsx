'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import type { VideoFile, AudioFile } from '@/services/file-system'
import type { VideoPlayerControls } from '@/types/video'

export interface FloatingPlayerContent {
  type: 'video' | 'audio' | 'youtube'
  title: string
  file?: File
  videoFile?: VideoFile
  audioFile?: AudioFile
  youtubeId?: string
  directoryHandle?: FileSystemDirectoryHandle
  selectedMarkerId?: string | null
  onMarkerSelect?: (markerId: string | null) => void
}

interface FloatingPlayerState {
  isOpen: boolean
  content: FloatingPlayerContent | null
  position: { x: number; y: number }
  size: { width: number; height: number }
  isMinimized: boolean
}

interface FloatingPlayerContextType {
  player: FloatingPlayerState
  openPlayer: (content: FloatingPlayerContent) => void
  closePlayer: () => void
  minimizePlayer: () => void
  maximizePlayer: () => void
  setPosition: (position: { x: number; y: number }) => void
  setSize: (size: { width: number; height: number }) => void
}

const FloatingPlayerContext = createContext<FloatingPlayerContextType | undefined>(undefined)

const defaultSize = { width: 600, height: 500 }
const defaultPosition = { x: 50, y: 50 }

export function FloatingPlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<FloatingPlayerState>({
    isOpen: false,
    content: null,
    position: defaultPosition,
    size: defaultSize,
    isMinimized: false
  })

  const openPlayer = (content: FloatingPlayerContent) => {
    setPlayer(prev => ({
      ...prev,
      isOpen: true,
      content,
      isMinimized: false
    }))
  }

  const closePlayer = () => {
    setPlayer(prev => ({
      ...prev,
      isOpen: false,
      content: null,
      isMinimized: false
    }))
  }

  const minimizePlayer = () => {
    setPlayer(prev => ({
      ...prev,
      isMinimized: true
    }))
  }

  const maximizePlayer = () => {
    setPlayer(prev => ({
      ...prev,
      isMinimized: false
    }))
  }

  const setPosition = (position: { x: number; y: number }) => {
    setPlayer(prev => ({
      ...prev,
      position
    }))
  }

  const setSize = (size: { width: number; height: number }) => {
    setPlayer(prev => ({
      ...prev,
      size
    }))
  }

  return (
    <FloatingPlayerContext.Provider
      value={{
        player,
        openPlayer,
        closePlayer,
        minimizePlayer,
        maximizePlayer,
        setPosition,
        setSize
      }}
    >
      {children}
    </FloatingPlayerContext.Provider>
  )
}

export function useFloatingPlayer() {
  const context = useContext(FloatingPlayerContext)
  if (!context) {
    throw new Error('useFloatingPlayer must be used within a FloatingPlayerProvider')
  }
  return context
}