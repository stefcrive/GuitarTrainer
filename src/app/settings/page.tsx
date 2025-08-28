'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { FolderSelectorButton } from '@/components/file-system/FolderSelectorButton'
import { useDirectoryStore } from '@/stores/directory-store'
import { useYouTubeStore } from '@/stores/youtube-store'
import { PlaylistManager } from '@/components/youtube/PlaylistManager'
import { Button } from '@/components/ui/button'
import { Trash2, RefreshCw, FileVideo, FileAudio, Target, AlertTriangle } from 'lucide-react'
import { fileSystemService } from '@/services/file-system'
import { markersService } from '@/services/markers'
import { getAudioMetadata, saveAudioMetadata } from '@/services/audio-metadata'

interface DirectoryStats {
  videoCount: number
  audioCount: number
  markerCount: number
  annotationCount: number
  isLoading: boolean
}

export default function SettingsPage() {
  const { 
    rootHandle, 
    audioRootHandle,
    scanVideoFolderForAudio,
    setRootHandle,
    setAudioRootHandle,
    setScanVideoFolderForAudio
  } = useDirectoryStore()
  
  const { loadPlaylistsFromFolder, clearPlaylists } = useYouTubeStore()

  const [videoStats, setVideoStats] = useState<DirectoryStats>({
    videoCount: 0,
    audioCount: 0,
    markerCount: 0,
    annotationCount: 0,
    isLoading: false
  })

  const [audioStats, setAudioStats] = useState<DirectoryStats>({
    videoCount: 0,
    audioCount: 0,
    markerCount: 0,
    annotationCount: 0,
    isLoading: false
  })

  const [showResetConfirmVideo, setShowResetConfirmVideo] = useState(false)
  const [showResetConfirmAudio, setShowResetConfirmAudio] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Calculate video directory statistics
  const calculateVideoStats = async (handle: FileSystemDirectoryHandle) => {
    setVideoStats(prev => ({ ...prev, isLoading: true }))
    
    try {
      const videos = await fileSystemService.scanForVideos(handle)
      let audioCount = 0
      let markerCount = 0
      let annotationCount = 0

      // Count audio files if scanning is enabled
      if (scanVideoFolderForAudio) {
        const audioFiles = await fileSystemService.scanForAudioFiles(handle)
        audioCount = audioFiles.length

        // Count audio markers and annotations
        for (const audio of audioFiles) {
          try {
            const metadata = await getAudioMetadata(audio, handle)
            if (metadata) {
              markerCount += metadata.markers?.length || 0
              annotationCount += metadata.annotations?.length || 0
            }
          } catch (error) {
            console.error('Error loading audio metadata:', error)
          }
        }
      }

      // Count video markers and annotations
      for (const video of videos) {
        try {
          const markerState = await markersService.loadMarkers(handle, video.path)
          if (markerState) {
            markerCount += markerState.markers?.length || 0
            annotationCount += markerState.annotations?.length || 0
          }
        } catch (error) {
          console.error('Error loading video markers:', error)
        }
      }

      setVideoStats({
        videoCount: videos.length,
        audioCount,
        markerCount,
        annotationCount,
        isLoading: false
      })
    } catch (error) {
      console.error('Error calculating video stats:', error)
      setVideoStats(prev => ({ ...prev, isLoading: false }))
    }
  }

  // Calculate audio directory statistics
  const calculateAudioStats = async (handle: FileSystemDirectoryHandle) => {
    setAudioStats(prev => ({ ...prev, isLoading: true }))
    
    try {
      const audioFiles = await fileSystemService.scanForAudioFiles(handle)
      let markerCount = 0
      let annotationCount = 0

      // Count audio markers and annotations
      for (const audio of audioFiles) {
        try {
          const metadata = await getAudioMetadata(audio, handle)
          if (metadata) {
            markerCount += metadata.markers?.length || 0
            annotationCount += metadata.annotations?.length || 0
          }
        } catch (error) {
          console.error('Error loading audio metadata:', error)
        }
      }

      setAudioStats({
        videoCount: 0,
        audioCount: audioFiles.length,
        markerCount,
        annotationCount,
        isLoading: false
      })
    } catch (error) {
      console.error('Error calculating audio stats:', error)
      setAudioStats(prev => ({ ...prev, isLoading: false }))
    }
  }

  // Reset all markers and annotations in video directory
  const resetVideoMarkers = async () => {
    if (!rootHandle) return
    
    setIsResetting(true)
    try {
      const videos = await fileSystemService.scanForVideos(rootHandle)
      
      // Reset video markers
      for (const video of videos) {
        try {
          await markersService.saveMarkers(rootHandle, video.path, { markers: [], annotations: [] })
        } catch (error) {
          console.error('Error resetting video markers:', error)
        }
      }

      // Reset audio markers if scanning is enabled
      if (scanVideoFolderForAudio) {
        const audioFiles = await fileSystemService.scanForAudioFiles(rootHandle)
        for (const audio of audioFiles) {
          try {
            const metadata = await getAudioMetadata(audio, rootHandle)
            if (metadata) {
              metadata.markers = []
              metadata.annotations = []
              await saveAudioMetadata(metadata, rootHandle)
            }
          } catch (error) {
            console.error('Error resetting audio markers:', error)
          }
        }
      }

      // Recalculate stats
      await calculateVideoStats(rootHandle)
      setShowResetConfirmVideo(false)
    } catch (error) {
      console.error('Error resetting markers:', error)
    } finally {
      setIsResetting(false)
    }
  }

  // Reset all markers and annotations in audio directory
  const resetAudioMarkers = async () => {
    if (!audioRootHandle) return
    
    setIsResetting(true)
    try {
      const audioFiles = await fileSystemService.scanForAudioFiles(audioRootHandle)
      
      for (const audio of audioFiles) {
        try {
          const metadata = await getAudioMetadata(audio, audioRootHandle)
          if (metadata) {
            metadata.markers = []
            metadata.annotations = []
            await saveAudioMetadata(metadata, audioRootHandle)
          }
        } catch (error) {
          console.error('Error resetting audio markers:', error)
        }
      }

      // Recalculate stats
      await calculateAudioStats(audioRootHandle)
      setShowResetConfirmAudio(false)
    } catch (error) {
      console.error('Error resetting markers:', error)
    } finally {
      setIsResetting(false)
    }
  }

  // Effect to calculate stats and load playlists when directories change
  useEffect(() => {
    if (rootHandle) {
      calculateVideoStats(rootHandle)
      loadPlaylistsFromFolder(rootHandle)
    } else {
      setVideoStats({ videoCount: 0, audioCount: 0, markerCount: 0, annotationCount: 0, isLoading: false })
      clearPlaylists()
    }
  }, [rootHandle, scanVideoFolderForAudio, loadPlaylistsFromFolder, clearPlaylists])

  useEffect(() => {
    if (audioRootHandle) {
      calculateAudioStats(audioRootHandle)
    } else {
      setAudioStats({ videoCount: 0, audioCount: 0, markerCount: 0, annotationCount: 0, isLoading: false })
    }
  }, [audioRootHandle])

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

                {/* Video Directory Statistics */}
                {rootHandle && (
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-sm">Directory Statistics</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => calculateVideoStats(rootHandle)}
                        disabled={videoStats.isLoading}
                        className="h-8"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${videoStats.isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <FileVideo className="h-5 w-5 text-blue-600" />
                        <div>
                          <div className="text-lg font-semibold">{videoStats.isLoading ? '...' : videoStats.videoCount}</div>
                          <div className="text-xs text-muted-foreground">Videos</div>
                        </div>
                      </div>
                      
                      {scanVideoFolderForAudio && (
                        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                          <FileAudio className="h-5 w-5 text-purple-600" />
                          <div>
                            <div className="text-lg font-semibold">{videoStats.isLoading ? '...' : videoStats.audioCount}</div>
                            <div className="text-xs text-muted-foreground">Audio Files</div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <Target className="h-5 w-5 text-green-600" />
                        <div>
                          <div className="text-lg font-semibold">{videoStats.isLoading ? '...' : videoStats.markerCount}</div>
                          <div className="text-xs text-muted-foreground">Markers</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <FileAudio className="h-5 w-5 text-orange-600" />
                        <div>
                          <div className="text-lg font-semibold">{videoStats.isLoading ? '...' : videoStats.annotationCount}</div>
                          <div className="text-xs text-muted-foreground">Annotations</div>
                        </div>
                      </div>
                    </div>

                    {/* Reset Button with Confirmation */}
                    {(videoStats.markerCount > 0 || videoStats.annotationCount > 0) && !showResetConfirmVideo && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowResetConfirmVideo(true)}
                        disabled={isResetting}
                        className="w-full"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Reset All Markers & Annotations
                      </Button>
                    )}

                    {/* Confirmation Dialog */}
                    {showResetConfirmVideo && (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h5 className="font-medium text-destructive mb-2">Confirm Reset</h5>
                            <p className="text-sm text-muted-foreground mb-4">
                              This will permanently delete all {videoStats.markerCount} markers and {videoStats.annotationCount} annotations 
                              in "{rootHandle.name}". This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={resetVideoMarkers}
                                disabled={isResetting}
                              >
                                {isResetting ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Resetting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Yes, Reset All
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowResetConfirmVideo(false)}
                                disabled={isResetting}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-6 space-y-6">
                <h3 className="text-lg font-semibold mb-4">Audio Root Directory</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select the root directory containing your audio files.
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

                {/* Audio Directory Statistics */}
                {audioRootHandle && (
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-sm">Directory Statistics</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => calculateAudioStats(audioRootHandle)}
                        disabled={audioStats.isLoading}
                        className="h-8"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${audioStats.isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <FileAudio className="h-5 w-5 text-purple-600" />
                        <div>
                          <div className="text-lg font-semibold">{audioStats.isLoading ? '...' : audioStats.audioCount}</div>
                          <div className="text-xs text-muted-foreground">Audio Files</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <Target className="h-5 w-5 text-green-600" />
                        <div>
                          <div className="text-lg font-semibold">{audioStats.isLoading ? '...' : audioStats.markerCount}</div>
                          <div className="text-xs text-muted-foreground">Markers</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                        <FileAudio className="h-5 w-5 text-orange-600" />
                        <div>
                          <div className="text-lg font-semibold">{audioStats.isLoading ? '...' : audioStats.annotationCount}</div>
                          <div className="text-xs text-muted-foreground">Annotations</div>
                        </div>
                      </div>
                    </div>

                    {/* Reset Button with Confirmation */}
                    {(audioStats.markerCount > 0 || audioStats.annotationCount > 0) && !showResetConfirmAudio && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowResetConfirmAudio(true)}
                        disabled={isResetting}
                        className="w-full"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Reset All Markers & Annotations
                      </Button>
                    )}

                    {/* Confirmation Dialog */}
                    {showResetConfirmAudio && (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h5 className="font-medium text-destructive mb-2">Confirm Reset</h5>
                            <p className="text-sm text-muted-foreground mb-4">
                              This will permanently delete all {audioStats.markerCount} markers and {audioStats.annotationCount} annotations 
                              in "{audioRootHandle.name}". This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={resetAudioMarkers}
                                disabled={isResetting}
                              >
                                {isResetting ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Resetting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Yes, Reset All
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowResetConfirmAudio(false)}
                                disabled={isResetting}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-6 space-y-6">
                <h3 className="text-lg font-semibold mb-4">YouTube Playlists</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add YouTube playlists to organize and watch your guitar lessons.
                  Playlists are stored as 'youtube-playlists.json' in your selected root directory.
                  You can find the playlist ID in the YouTube URL after "?list=".
                </p>
                
                {!rootHandle && (
                  <div className="p-3 text-sm border border-yellow-500/50 bg-yellow-500/10 rounded-md">
                    Please select a root directory above to enable playlist storage.
                  </div>
                )}
                
                <PlaylistManager />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}