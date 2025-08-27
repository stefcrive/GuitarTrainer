export interface FileSystemAudio {
  id: string
  type: 'file'
  name: string
  path: string
  handle?: FileSystemFileHandle
  fileType?: 'mp3' | 'wav' | 'aiff'
}

export interface StoredAudioFile extends FileSystemAudio {
  rootDirectoryName: string
  metadata?: AudioMetadata
}

export type AudioFile = FileSystemAudio
export type StoredAudioFavorite = StoredAudioFile

export interface AudioMarker {
  id: string
  startTime: number
  endTime: number
  isLooping: boolean
  isRecording?: boolean
  audioBlob?: Blob
  completionDegree?: number // Track completion percentage
  createdAt?: number // timestamp when marker was created
}

export interface AudioAnnotation {
  id: string
  markerId: string
  text: string
  tags: string[]
  timestamp: number
}

export interface AudioLoopRegion {
  start: number
  end: number
  enabled: boolean
}

export interface AudioMetadata {
  id: string
  path: string
  title?: string
  tags: string[]
  loopRegion: AudioLoopRegion
  markers: AudioMarker[]
  annotations: AudioAnnotation[]
  playbackRate: number
  volume?: number
}