'use client'

import type { Video, FileSystemVideo, YouTubeVideo } from '@/types/video'

interface StoredRecentFileVideo extends FileSystemVideo {
  rootDirectoryName: string
  viewedAt: number
}

interface StoredRecentYouTubeVideo extends YouTubeVideo {
  viewedAt: number
}

type StoredRecentVideo = StoredRecentFileVideo | StoredRecentYouTubeVideo

const RECENT_VIDEOS_KEY = 'recent-videos'
const MAX_RECENT_VIDEOS = 20

export const recentlyViewedService = {
  async getRecentVideos(): Promise<StoredRecentVideo[]> {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(RECENT_VIDEOS_KEY)
    return stored ? JSON.parse(stored) : []
  },

  async addRecentVideo(video: Video, directoryHandle?: FileSystemDirectoryHandle) {
    const recentVideos = await this.getRecentVideos()
    const now = Date.now()
    
    // Remove existing entry if present
    const filteredVideos = recentVideos.filter(v => {
      if (video.type === 'file' && v.type === 'file') {
        return v.path !== video.path
      }
      if (video.type === 'youtube' && v.type === 'youtube') {
        return v.id !== video.id
      }
      return true
    })
    
    // Add new entry at the beginning
    let recentVideo: StoredRecentVideo
    if (video.type === 'file' && directoryHandle) {
      recentVideo = {
        ...video,
        rootDirectoryName: directoryHandle.name,
        viewedAt: now
      }
    } else if (video.type === 'youtube') {
      recentVideo = {
        ...video,
        viewedAt: now
      }
    } else {
      throw new Error('Invalid video type or missing directory handle for file video')
    }

    filteredVideos.unshift(recentVideo)
    
    // Keep only the most recent MAX_RECENT_VIDEOS
    const trimmedVideos = filteredVideos.slice(0, MAX_RECENT_VIDEOS)
    
    localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(trimmedVideos))
  },

  async removeRecentVideo(video: Video) {
    const recentVideos = await this.getRecentVideos()
    const filtered = recentVideos.filter(v => {
      if (video.type === 'file' && v.type === 'file') {
        return v.path !== video.path
      }
      if (video.type === 'youtube' && v.type === 'youtube') {
        return v.id !== video.id
      }
      return true
    })
    localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(filtered))
  },

  async clearRecentVideos() {
    localStorage.removeItem(RECENT_VIDEOS_KEY)
  }
}