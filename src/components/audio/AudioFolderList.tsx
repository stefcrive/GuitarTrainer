'use client'

import { RelatedMaterialLinks } from '@/components/materials/MaterialLibrary'
import { materialFolderPath } from '@/lib/practice-material'
import { useState, useEffect } from 'react'
import { AudioFile, AudioMetadata } from '@/types/audio'
import { ChevronDown, ChevronRight, Folder, Music, Circle, Star } from 'lucide-react'
import { useDirectoryStore } from '@/stores/directory-store'
import { Button } from '@/components/ui/button'
import { getAllAudioMetadata } from '@/services/audio-metadata'
import { favoritesService } from '@/services/favorites'

interface AudioFolderListProps {
  audioFiles: AudioFile[]
  selectedAudio?: AudioFile | null
  onAudioSelect: (audio: AudioFile) => void
  directoryHandle: FileSystemDirectoryHandle
}

type FolderNode = {
  folders: Record<string, FolderNode>
  audioFiles: AudioFile[]
}

function createFolderNode(): FolderNode {
  return {
    folders: {},
    audioFiles: []
  }
}

function organizeByFolder(audioFiles: AudioFile[]): FolderNode {
  const structure = createFolderNode()

  audioFiles.forEach(audio => {
    const parts = materialFolderPath(audio.path).split('/').filter(Boolean)
    let current = structure

    for (const part of parts) {
      if (!current.folders[part]) {
        current.folders[part] = createFolderNode()
      }
      current = current.folders[part]
    }

    // Add audio file to its containing folder
    current.audioFiles.push(audio)
  })

  return structure
}

function FolderItem({
  name,
  content,
  level = 0,
  folderPath = '',
  onAudioSelect,
  selectedAudio,
  directoryHandle
}: {
  name: string
  content: FolderNode
  level?: number
  folderPath?: string
  onAudioSelect: (audio: AudioFile) => void
  selectedAudio?: AudioFile | null
  directoryHandle: FileSystemDirectoryHandle
}) {
  const { expandedFolders, expandFolder, collapseFolder } = useDirectoryStore()
  const isOpen = name === '' || expandedFolders.includes(folderPath)
  const hasContent = content.audioFiles.length > 0 || Object.keys(content.folders).length > 0
  const paddingLeft = `${level * 12}px`

  if (!hasContent) return null

  return (
    <div>
      {name && (
        <button
          className="flex h-8 items-center w-full px-1 text-xs hover:bg-accent rounded text-left font-medium"
          aria-expanded={isOpen}
          style={{ paddingLeft }}
          onClick={() => isOpen ? collapseFolder(folderPath) : expandFolder(folderPath)}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
          )}
          <Folder className="h-4 w-4 mr-2 text-purple-600" />
          <span className="min-w-0 flex-1 truncate" title={folderPath}>{name}</span>
        </button>
      )}
      
      {isOpen && (
        <div className="space-y-0.5">
          {/* Audio files in current folder */}
          {content.audioFiles.map(audio => (
            <AudioFileItem
              key={audio.path}
              audio={audio}
              level={level}
              selected={selectedAudio?.path === audio.path}
              onSelect={onAudioSelect}
              directoryHandle={directoryHandle}
            />
          ))}
          
          {/* Nested folders */}
          {Object.entries(content.folders).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([folderName, folderContent]) => (
            <FolderItem
              key={folderName}
              name={folderName}
              folderPath={folderPath ? `${folderPath}/${folderName}` : folderName}
              content={folderContent}
              level={level + 1}
              onAudioSelect={onAudioSelect}
              selectedAudio={selectedAudio}
              directoryHandle={directoryHandle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AudioFileItem({
  audio,
  level,
  selected,
  onSelect,
  directoryHandle,
}: {
  audio: AudioFile
  level: number
  selected: boolean
  onSelect: (audio: AudioFile) => void
  directoryHandle: FileSystemDirectoryHandle
}) {
  const [hasMarkers, setHasMarkers] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    async function checkMarkers() {
      const metadata = await getAllAudioMetadata(directoryHandle)
      const audioMetadata = metadata[audio.path]
      setHasMarkers(!!audioMetadata?.markers?.length)
    }
    checkMarkers()
  }, [audio.path, directoryHandle])

  useEffect(() => {
    async function checkFavorite() {
      const favorite = await favoritesService.isAudioFavorite(audio)
      setIsFavorite(favorite)
    }
    checkFavorite()
  }, [audio])

  return (
    <div
      className={`flex items-center justify-between w-full h-8 text-xs py-0.5 px-2 hover:bg-accent rounded text-left cursor-pointer ${
        selected ? 'bg-accent text-accent-foreground' : ''
      } ${isFavorite ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400' : ''}`}
      style={{ paddingLeft: `${Math.min(level + 1, 4) * 12}px` }}

    >
      <button type="button" aria-pressed={selected} title={audio.path} onClick={() => onSelect(audio)} className="flex h-8 items-center gap-2 flex-1 min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Music className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
        <span className="truncate">{audio.name}</span>
        {hasMarkers && (
          <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />
        )}
        {isFavorite && (
          <Star className="h-3 w-3 text-yellow-500 fill-current flex-shrink-0" />
        )}
      </button>
      <RelatedMaterialLinks path={audio.path} kind="audio" root={directoryHandle} />
    </div>
  )
}

export function AudioFolderList({
  audioFiles,
  selectedAudio,
  onAudioSelect,
  directoryHandle
}: AudioFolderListProps) {
  const [loading, setLoading] = useState(true)
  const structure = organizeByFolder(audioFiles)

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="space-y-2 p-4 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-accent/20 rounded"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <FolderItem
        name=""
        content={structure}
        onAudioSelect={onAudioSelect}
        selectedAudio={selectedAudio}
        directoryHandle={directoryHandle}
      />
    </div>
  )
}