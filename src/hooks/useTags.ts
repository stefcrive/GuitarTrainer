'use client'

import { useState, useEffect } from 'react'

export function useTags() {
  const [tags, setTags] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const savedTags = localStorage.getItem('savedTags')
      const parsed = savedTags ? JSON.parse(savedTags) : []
      return parsed
    }
    return []
  })

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags(prev => {
        const newTags = [...prev, trimmedTag]
        localStorage.setItem('savedTags', JSON.stringify(newTags))
        return newTags
      })
    }
  }

  const addTags = (newTags: string[]) => {
    setTags(prev => {
      const uniqueTags = [...new Set([...prev, ...newTags.map(t => t.trim())])]
      localStorage.setItem('savedTags', JSON.stringify(uniqueTags))
      return uniqueTags
    })
  }

  const removeTag = (tag: string) => {
    setTags(prev => {
      const newTags = prev.filter(t => t !== tag)
      localStorage.setItem('savedTags', JSON.stringify(newTags))
      return newTags
    })
  }

  return {
    tags,
    addTag,
    addTags,
    removeTag
  }
}