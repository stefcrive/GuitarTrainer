'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DocumentLibraryPreferences {
  folders: Record<string, boolean>
  starred: Record<string, boolean>
  showAudio: boolean
  filter: 'all' | 'markers' | 'transcriptions' | 'starred'
  setFolder: (key: string, open: boolean) => void
  toggleStar: (key: string) => void
  setShowAudio: (showAudio: boolean) => void
  setFilter: (filter: DocumentLibraryPreferences['filter']) => void
}

export const useDocumentLibraryStore = create<DocumentLibraryPreferences>()(persist(set => ({
  folders: {}, starred: {}, showAudio: false, filter: 'all',
  setFolder: (key, open) => set(state => ({ folders: { ...state.folders, [key]: open } })),
  toggleStar: key => set(state => ({ starred: { ...state.starred, [key]: !state.starred[key] } })),
  setShowAudio: showAudio => set({ showAudio }),
  setFilter: filter => set({ filter })
}), { name: 'document-library-preferences' }))
