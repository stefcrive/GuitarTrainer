export interface TimeMarker {
  id: string
  startTime: number // in seconds
  endTime: number // in seconds
  isLooping?: boolean
  audioBlob?: Blob // recorded audio data
  isRecording?: boolean
  completionDegree?: number // 0-100 percentage of completion
}

export interface VideoAnnotation {
  id: string
  markerId: string
  text: string
  tags: string[]
  timestamp: number // when the annotation was created
}

export interface VideoMarkerState {
  markers: TimeMarker[]
  annotations: VideoAnnotation[]
  activeMarkerId: string | null
  isLooping: boolean
}

export interface VideoPlayerControls {
  play: () => void
  pause: () => void
  seek: (time: number) => void
  seekForward: () => void
  seekBackward: () => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  getPlaybackRate: () => number
  getVideoElement: () => HTMLVideoElement | HTMLIFrameElement | null
}

export interface BaseVideo {
  id: string
  type: 'file' | 'youtube'
}

export interface YouTubeVideo extends BaseVideo {
  type: 'youtube'
  id: string
  title?: string
}

export interface FileSystemVideo extends BaseVideo {
  type: 'file'
  id: string
  name: string
  path: string
  handle?: FileSystemFileHandle
}

export type Video = YouTubeVideo | FileSystemVideo