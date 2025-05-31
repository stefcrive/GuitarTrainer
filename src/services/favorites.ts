'use client'

import { Video, FileSystemVideo, YouTubeVideo } from '@/types/video'
import { AudioFile, AudioMetadata } from '@/types/audio'

interface StoredFileVideo extends Omit<FileSystemVideo, 'handle'> {
  rootDirectoryName: string
}

interface StoredAudioFile extends Omit<AudioFile, 'handle'> {
  rootDirectoryName: string
  metadata?: AudioMetadata
}

type StoredVideo = StoredFileVideo | YouTubeVideo
type StoredItem = StoredVideo | StoredAudioFile

const VIDEO_FAVORITES_KEY = 'video-favorites'
const AUDIO_FAVORITES_KEY = 'audio-favorites'

export const favoritesService = {
  async getVideoFavorites(): Promise<StoredVideo[]> {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(VIDEO_FAVORITES_KEY)
    return stored ? JSON.parse(stored) : []
  },

  async getAudioFavorites(): Promise<StoredAudioFile[]> {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(AUDIO_FAVORITES_KEY)
    return stored ? JSON.parse(stored) : []
  },

  async addVideoFavorite(video: Video, directoryHandle?: FileSystemDirectoryHandle | null) {
    const favorites = await this.getVideoFavorites()
    if (!favorites.some(fav => fav.id === video.id && fav.type === video.type)) {
      let favorite: StoredVideo
      if (video.type === 'file') {
        const fileVideo = video as FileSystemVideo
        if (!directoryHandle) {
          throw new Error("Directory handle required to add file system video to favorites")
        }
        favorite = {
          id: fileVideo.id,
          type: 'file',
          name: fileVideo.name,
          path: fileVideo.path,
          rootDirectoryName: directoryHandle.name
        }
      } else {
        const youtubeVideo = video as YouTubeVideo
        favorite = {
          id: youtubeVideo.id,
          type: 'youtube',
          title: youtubeVideo.title
        }
      }
      favorites.push(favorite)
      localStorage.setItem(VIDEO_FAVORITES_KEY, JSON.stringify(favorites))
    }
  },

  async addAudioFavorite(audio: AudioFile, metadata: AudioMetadata | undefined, directoryHandle: FileSystemDirectoryHandle) {
    const favorites = await this.getAudioFavorites()
    if (!favorites.some(fav => fav.path === audio.path)) {
      const favorite: StoredAudioFile = {
        name: audio.name,
        path: audio.path,
        type: audio.type,
        rootDirectoryName: directoryHandle.name,
        metadata
      }
      favorites.push(favorite)
      localStorage.setItem(AUDIO_FAVORITES_KEY, JSON.stringify(favorites))
    }
  },

  async removeVideoFavorite(video: Video) {
    const favorites = await this.getVideoFavorites()
    const filtered = favorites.filter(
      fav => !(fav.id === video.id && fav.type === video.type)
    )
    localStorage.setItem(VIDEO_FAVORITES_KEY, JSON.stringify(filtered))
  },

  async removeAudioFavorite(audio: AudioFile) {
    const favorites = await this.getAudioFavorites()
    const filtered = favorites.filter(fav => fav.path !== audio.path)
    localStorage.setItem(AUDIO_FAVORITES_KEY, JSON.stringify(filtered))
  },

  async isVideoFavorite(video: Video): Promise<boolean> {
    const favorites = await this.getVideoFavorites()
    return favorites.some(
      fav => fav.id === video.id && fav.type === video.type
    )
  },

  async isAudioFavorite(audio: AudioFile): Promise<boolean> {
    const favorites = await this.getAudioFavorites()
    return favorites.some(fav => fav.path === audio.path)
  }
}