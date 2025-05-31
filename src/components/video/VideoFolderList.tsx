'use client'

import { useState, useEffect } from 'react'
import { VideoFile } from '@/services/file-system'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { FavoriteButton } from './FavoriteButton'
import { VideoTitle } from './VideoTitle'
import { useDirectoryStore } from '@/stores/directory-store'

interface VideoFolderListProps {
  videos: VideoFile[]
  selectedVideo?: VideoFile | null
  onVideoSelect: (video: VideoFile) => void
  directoryHandle: FileSystemDirectoryHandle
}

type FolderNode = {
  folders: Record<string, FolderNode>
  videos: VideoFile[]
}

function createFolderNode(): FolderNode {
  return {
    folders: {},
    videos: []
  }
}

function organizeByFolder(videos: VideoFile[]): FolderNode {
  const structure = createFolderNode()

  videos.forEach(video => {
    const parts = video.path.split('/')
    const fileName = parts.pop() // Remove file name
    let current = structure

    for (const part of parts) {
      if (!current.folders[part]) {
        current.folders[part] = createFolderNode()
      }
      current = current.folders[part]
    }

    // Add video to its containing folder
    current.videos.push(video)
  })

  return structure
}

function FolderItem({
  name,
  content,
  level = 0,
  onVideoSelect,
  selectedVideo,
  directoryHandle
}: {
  name: string
  content: FolderNode
  level?: number
  onVideoSelect: (video: VideoFile) => void
  selectedVideo?: VideoFile | null
  directoryHandle: FileSystemDirectoryHandle
}) {
  const { expandedFolders, expandFolder, collapseFolder } = useDirectoryStore()
  const isOpen = name === '' || expandedFolders.has(name)
  const hasContent = content.videos.length > 0 || Object.keys(content.folders).length > 0
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
          {/* Videos in current folder */}
          {content.videos.map(video => (
            <div
              key={video.path}
              className={`flex items-center justify-between w-full p-2 hover:bg-accent rounded text-left cursor-pointer ${
                selectedVideo?.path === video.path ? 'bg-accent text-accent-foreground' : ''
              }`}
              style={{ paddingLeft: `${(level + 1) * 16}px` }}
              onClick={() => onVideoSelect(video)}
            >
              <VideoTitle
                title={video.name}
                videoPath={video.path}
                className="truncate"
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                <FavoriteButton
                  video={video}
                  directoryHandle={directoryHandle}
                />
              </div>
            </div>
          ))}
          
          {/* Nested folders */}
          {Object.entries(content.folders).map(([folderName, folderContent]) => (
            <FolderItem
              key={folderName}
              name={folderName}
              content={folderContent}
              level={level + 1}
              onVideoSelect={onVideoSelect}
              selectedVideo={selectedVideo}
              directoryHandle={directoryHandle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function VideoFolderList({
  videos,
  selectedVideo,
  onVideoSelect,
  directoryHandle
}: VideoFolderListProps) {
  const [loading, setLoading] = useState(true)
  const structure = organizeByFolder(videos)

  useEffect(() => {
    // Simulate loading delay
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
        onVideoSelect={onVideoSelect}
        selectedVideo={selectedVideo}
        directoryHandle={directoryHandle}
      />
    </div>
  )
}