'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { AudioFolderList } from '@/components/audio/AudioFolderList'
import Link from 'next/link'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { Input } from '@/components/ui/input'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useDirectoryStore } from '@/stores/directory-store'
import { useMediaStore } from '@/stores/media-store'
import { AudioFile } from '@/types/audio'
import { Search, Music } from 'lucide-react'

async function scanDirectory(dirHandle: FileSystemDirectoryHandle, root = ''): Promise<AudioFile[]> {
  const audioFiles: AudioFile[] = []
  
  for await (const entry of dirHandle.values()) {
    const path = root ? `${root}/${entry.name}` : entry.name

    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle
      const extension = entry.name.split('.').pop()?.toLowerCase()
      if (['mp3', 'wav', 'aiff'].includes(extension || '')) {
        audioFiles.push({
          id: path,
          name: entry.name,
          path,
          handle: fileHandle,
          type: 'file',
          fileType: extension as 'mp3' | 'wav' | 'aiff'
        })
      }
    } else if (entry.kind === 'directory') {
      const dirEntry = entry as FileSystemDirectoryHandle
      const subDirFiles = await scanDirectory(dirEntry, path)
      audioFiles.push(...subDirFiles)
    }
  }

  return audioFiles
}

export default function AudioPage() {
  const { audioRootHandle, rootHandle, scanVideoFolderForAudio } = useDirectoryStore()
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [filteredAudioFiles, setFilteredAudioFiles] = useState<AudioFile[]>([])
  const [loading, setLoading] = useState(true)
  
  // Use global media store instead of local state
  const {
    audio: { selectedAudio, searchQuery },
    setSelectedAudio,
    setAudioSearchQuery
  } = useMediaStore()

  useEffect(() => {
    async function loadAudioFiles() {
      setLoading(true)
      try {
        const files: AudioFile[] = []

        if (audioRootHandle) {
          const audioFiles = await scanDirectory(audioRootHandle)
          files.push(...audioFiles)
        }

        if (scanVideoFolderForAudio && rootHandle) {
          const videoFolderAudioFiles = await scanDirectory(rootHandle)
          files.push(...videoFolderAudioFiles)
        }

        const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path))
        setAudioFiles(sortedFiles)
        setFilteredAudioFiles(sortedFiles)
      } catch (error) {
        console.error('Error scanning audio files:', error)
      }
      setLoading(false)
    }

    loadAudioFiles()
  }, [audioRootHandle, rootHandle, scanVideoFolderForAudio])

  // Filter audio files based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredAudioFiles(audioFiles)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = audioFiles.filter(audio =>
        audio.name.toLowerCase().includes(query) ||
        audio.path.toLowerCase().includes(query)
      )
      setFilteredAudioFiles(filtered)
    }
  }, [audioFiles, searchQuery])

  if (!audioRootHandle && (!scanVideoFolderForAudio || !rootHandle)) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <div className="flex flex-col items-center justify-center gap-4 h-full">
            <p>Please select a root directory in settings first</p>
            <Link
              href="/settings"
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ResizablePanelGroup direction="horizontal" className="min-h-screen">
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full border-r bg-muted/30">
              <div className="p-4 space-y-4">
                <h2 className="text-xl font-semibold">Audio Library</h2>
                
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search your audio files..."
                    value={searchQuery}
                    onChange={(e) => setAudioSearchQuery(e.target.value)}
                    className="pl-9 h-10 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-primary/50 transition-colors"
                  />
                </div>
                
                {/* Quick Stats */}
                <div className="flex gap-2 text-xs">
                  <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg flex items-center gap-2">
                    <Music className="h-3 w-3" />
                    <span>{filteredAudioFiles.length} Audio Files</span>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-350px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800">
                  {loading ? (
                    <div className="animate-pulse space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-8 bg-accent/20 rounded"></div>
                      ))}
                    </div>
                  ) : filteredAudioFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4">
                      <Music className="h-12 w-12 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        {searchQuery ? 'No audio files match your search.' : 'No audio files found. Add some audio files to your selected directories.'}
                      </p>
                    </div>
                  ) : (
                    <AudioFolderList
                      audioFiles={filteredAudioFiles}
                      selectedAudio={selectedAudio}
                      onAudioSelect={setSelectedAudio}
                      directoryHandle={audioRootHandle || rootHandle!}
                    />
                  )}
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={70}>
            <div className="p-4">
              {selectedAudio ? (
                <AudioPlayer audioFile={selectedAudio} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select an audio file to play
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}