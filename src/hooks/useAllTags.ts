'use client'

import { useMemo } from 'react'
import { useTagStore } from '@/stores/tag-store'
import { useTags } from './useTags'

export function useAllTags() {
  const { tags: savedTags } = useTags() // Tags from localStorage
  const { collectedTags } = useTagStore() // Tags from loaded marker data
  
  // Combine and deduplicate all available tags
  const allTags = useMemo(() => {
    const combined = [...new Set([...savedTags, ...collectedTags])]
    const result = combined.filter(tag => tag && tag.trim().length > 0).sort()
    return result
  }, [savedTags, collectedTags])

  return allTags
}