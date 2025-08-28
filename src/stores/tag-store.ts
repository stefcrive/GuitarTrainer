'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TagStore {
  // All tags collected from loaded markers
  collectedTags: string[]
  
  // Actions
  addCollectedTags: (tags: string[]) => void
  clearCollectedTags: () => void
  setCollectedTags: (tags: string[]) => void
}

export const useTagStore = create<TagStore>()(
  persist(
    (set, get) => ({
      collectedTags: [],
      
      addCollectedTags: (newTags: string[]) => {
        set((state) => {
          const uniqueTags = [...new Set([...state.collectedTags, ...newTags])]
          return { collectedTags: uniqueTags.sort() }
        })
      },
      
      clearCollectedTags: () => set({ collectedTags: [] }),
      
      setCollectedTags: (tags: string[]) => {
        set((state) => {
          const uniqueTags = [...new Set(tags)]
          const sortedTags = uniqueTags.sort()
          
          // Only update if the tags have actually changed
          if (JSON.stringify(state.collectedTags) !== JSON.stringify(sortedTags)) {
            return { collectedTags: sortedTags }
          }
          return state
        })
      }
    }),
    {
      name: 'tag-storage',
    }
  )
)