'use client'

import { Header } from '@/components/layout/Header'
import { FolderSelectorButton } from '@/components/file-system/FolderSelectorButton'
import { useDirectoryStore } from '@/stores/directory-store'
import { PlaylistManager } from '@/components/youtube/PlaylistManager'

export default function SettingsPage() {
  const { 
    rootHandle, 
    audioRootHandle,
    scanVideoFolderForAudio,
    setRootHandle,
    setAudioRootHandle,
    setScanVideoFolderForAudio
  } = useDirectoryStore()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <div className="p-6">
          <div className="w-full max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>
            
            <div className="space-y-8">
              <div className="border rounded-lg p-6 space-y-6">
                <h3 className="text-lg font-semibold mb-4">Video Root Directory</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select the root directory containing your guitar course videos. 
                  This directory will be used to scan for video files.
                </p>
                
                <div className="flex items-center gap-4">
                  <FolderSelectorButton
                    onFolderSelect={(_, handle) => setRootHandle(handle)}
                    onError={(error) => console.error('Error selecting folder:', error)}
                    buttonText={rootHandle ? 'Change Directory' : 'Select Directory'}
                  />
                  {rootHandle && (
                    <span className="text-sm text-muted-foreground">
                      Current: {rootHandle.name}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scanVideoFolderForAudio}
                      onChange={(e) => setScanVideoFolderForAudio(e.target.checked)}
                      className="form-checkbox h-4 w-4"
                    />
                    <span className="text-sm text-muted-foreground">
                      Scan this folder for audio files (*.mp3, *.wav, *.aiff)
                    </span>
                  </label>
                </div>
              </div>

              <div className="border rounded-lg p-6 space-y-6">
                <h3 className="text-lg font-semibold mb-4">Audio Root Directory</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select the root directory containing your backing tracks and audio files.
                  This directory will be used to scan for audio files (*.mp3, *.wav, *.aiff).
                </p>
                
                <div className="flex items-center gap-4">
                  <FolderSelectorButton
                    onFolderSelect={(_, handle) => setAudioRootHandle(handle)}
                    onError={(error) => console.error('Error selecting folder:', error)}
                    buttonText={audioRootHandle ? 'Change Directory' : 'Select Directory'}
                  />
                  {audioRootHandle && (
                    <span className="text-sm text-muted-foreground">
                      Current: {audioRootHandle.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-6 space-y-6">
                <h3 className="text-lg font-semibold mb-4">YouTube Playlists</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add YouTube playlists to organize and watch your guitar lessons.
                  You can find the playlist ID in the YouTube URL after "?list=".
                </p>
                
                <PlaylistManager />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}