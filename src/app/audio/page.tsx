'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { AudioFolderList } from '@/components/audio/AudioFolderList'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { useDirectoryStore } from '@/stores/directory-store'
import { AudioFile } from '@/types/audio'

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
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null)
  const [loading, setLoading] = useState(true)

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

        setAudioFiles(files.sort((a, b) => a.path.localeCompare(b.path)))
      } catch (error) {
        console.error('Error scanning audio files:', error)
      }
      setLoading(false)
    }

    loadAudioFiles()
  }, [audioRootHandle, rootHandle, scanVideoFolderForAudio])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex">
        <div className="w-80 border-r p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Audio Library</h2>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-accent/20 rounded"></div>
              ))}
            </div>
          ) : audioFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audio files found. Add some audio files to your selected directories.
            </p>
          ) : (
            <AudioFolderList
              audioFiles={audioFiles}
              selectedAudio={selectedAudio}
              onAudioSelect={setSelectedAudio}
              directoryHandle={audioRootHandle || rootHandle!}
            />
          )}
        </div>

        <div className="flex-1 p-4">
          {selectedAudio ? (
            <AudioPlayer audioFile={selectedAudio} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Select an audio file to play
            </div>
          )}
        </div>
      </main>
    </div>
  )
}