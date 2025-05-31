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
  time: number
  name: string
  tags: string[]
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
  playbackRate: number
}