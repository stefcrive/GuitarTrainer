'use client'

import { create } from 'zustand'

export interface PlaybackSession {
  owner: symbol
  title: string
  href: string
  getCurrentTime: () => number
  getDuration: () => number
  isPlaying: () => boolean
  play: () => void | Promise<void>
  pause: () => void | Promise<void>
  seek: (time: number) => void | Promise<void>
}

interface PlaybackStore {
  active: PlaybackSession | null
  error: string | null
  activate: (session: PlaybackSession) => void
  release: (owner: symbol) => void
  setError: (error: string | null) => void
}

// Runtime only: media handles and live transports must never enter localStorage.
export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  active: null,
  error: null,
  activate: (session) => {
    const previous = get().active
    if (previous?.owner === session.owner) return
    set({ active: session, error: null })
    if (previous) {
      Promise.resolve().then(() => previous.pause()).catch((error) => {
        set({ error: error instanceof Error ? error.message : 'Unable to pause the previous player.' })
      })
    }
  },
  release: (owner) => {
    if (get().active?.owner === owner) set({ active: null, error: null })
  },
  setError: (error) => set({ error })
}))
