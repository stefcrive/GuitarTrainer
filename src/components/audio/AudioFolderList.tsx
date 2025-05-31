'use client'

import { useState, useEffect } from 'react'
import { AudioFile } from '@/types/audio'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDirectoryStore } from '@/stores/directory-store'

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
    const parts = audio.path.split('/')
    const fileName = parts.pop() // Remove file name
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
  onAudioSelect,
  selectedAudio,
  directoryHandle
}: {
  name: string
  content: FolderNode
  level?: number
  onAudioSelect: (audio: AudioFile) => void
  selectedAudio?: AudioFile | null
  directoryHandle: FileSystemDirectoryHandle
}) {
  const { expandedFolders, expandFolder, collapseFolder } = useDirectoryStore()
  const isOpen = name === '' || expandedFolders.has(name)
  const hasContent = content.audioFiles.length > 0 || Object.keys(content.folders).length > 0
  const paddingLeft = `${level * 16}px`

  if (!hasContent) return null

  return (
    <div>
      {name && (
        <button
          className="flex items-center w-full p-2 hover:bg-accent rounded"
          style={{ paddingLeft }}
          onClick={() => isOpen ? collapseFolder(name) : expandFolder(name)}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 mr-1" />
          ) : (
            <ChevronRight className="h-4 w-4 mr-1" />
          )}
          <span className="font-medium">{name}</span>
        </button>
      )}
      
      {isOpen && (
        <div className="space-y-1">
          {/* Audio files in current folder */}
          {content.audioFiles.map(audio => (
            <div
              key={audio.path}
              className={`flex items-center justify-between w-full p-2 hover:bg-accent rounded text-left cursor-pointer ${
                selectedAudio?.path === audio.path ? 'bg-accent text-accent-foreground' : ''
              }`}
              style={{ paddingLeft: `${(level + 1) * 16}px` }}
              onClick={() => onAudioSelect(audio)}
            >
              <span className="truncate flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase">
                  {audio.type}
                </span>
                {audio.name}
              </span>
            </div>
          ))}
          
          {/* Nested folders */}
          {Object.entries(content.folders).map(([folderName, folderContent]) => (
            <FolderItem
              key={folderName}
              name={folderName}
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
    <div className="space-y-1">
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