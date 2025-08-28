'use client'

import { useState, useEffect } from 'react'
import { VideoFile } from '@/services/file-system'
import { ChevronDown, ChevronRight, Folder, Video as VideoIcon, Star } from 'lucide-react'
import { VideoTitle } from './VideoTitle'
import { useDirectoryStore } from '@/stores/directory-store'
import { favoritesService } from '@/services/favorites'

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
  const isOpen = name === '' || expandedFolders.includes(name)
  const hasContent = content.videos.length > 0 || Object.keys(content.folders).length > 0
  const paddingLeft = `${level * 16}px`

  if (!hasContent) return null

  return (
    <div>
      {name && (
        <button
          className="flex items-center w-full p-2 hover:bg-accent rounded text-left font-medium"
          style={{ paddingLeft }}
          onClick={() => isOpen ? collapseFolder(name) : expandFolder(name)}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
          )}
          <Folder className="h-4 w-4 mr-2 text-blue-600" />
          <span className="flex-1">{name}</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {content.videos.length}
          </span>
        </button>
      )}
      
      {isOpen && (
        <div className="space-y-0.5">
          {/* Videos in current folder */}
          {content.videos.map(video => (
            <VideoFileItem
              key={video.path}
              video={video}
              level={level}
              selected={selectedVideo?.path === video.path}
              onSelect={onVideoSelect}
              directoryHandle={directoryHandle}
            />
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

function VideoFileItem({
  video,
  level,
  selected,
  onSelect,
  directoryHandle,
}: {
  video: VideoFile
  level: number
  selected: boolean
  onSelect: (video: VideoFile) => void
  directoryHandle: FileSystemDirectoryHandle
}) {
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    async function checkFavorite() {
      const favorite = await favoritesService.isVideoFavorite(video)
      setIsFavorite(favorite)
    }
    checkFavorite()
  }, [video])

  return (
    <div
      className={`flex items-center w-full py-0.5 px-2 hover:bg-accent rounded text-left cursor-pointer ${
        selected ? 'bg-accent text-accent-foreground' : ''
      } ${isFavorite ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400' : ''}`}
      style={{ paddingLeft: `${(level + 1) * 16}px` }}
      onClick={() => onSelect(video)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <VideoIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <VideoTitle
          title={video.name}
          videoPath={video.path}
          className="truncate"
        />
        {isFavorite && (
          <Star className="h-3 w-3 text-yellow-500 fill-current flex-shrink-0" />
        )}
      </div>
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
    <div className="space-y-0.5">
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